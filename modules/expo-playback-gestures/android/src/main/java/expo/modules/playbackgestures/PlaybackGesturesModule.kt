package expo.modules.playbackgestures

import android.app.Activity
import android.content.Context
import android.media.AudioManager
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 播放手势原生模块（M2 文档 §4.8）：窗口亮度 + 媒体音量。
 * 亮度调 Activity 窗口亮度（window.attributes.screenBrightness，0..1；退出播放页由 JS 侧恢复 -1
 * 跟随系统）——规避系统亮度所需 WRITE_SETTINGS 权限；音量用 AudioManager.setStreamVolume
 * (STREAM_MUSIC) 且不带 FLAG_SHOW_UI，进度气泡由播放页自绘。
 */
class PlaybackGesturesModule : Module() {
  private val audioManager: AudioManager
    get() {
      val reactContext = requireNotNull(appContext.reactContext) {
        "React 上下文不可用"
      }
      return reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

  private val currentActivity: Activity
    get() = requireNotNull(appContext.activityProvider?.currentActivity) {
      "无当前 Activity"
    }

  override fun definition() = ModuleDefinition {
    Name("ExpoPlaybackGestures")

    // 设置窗口亮度（0..1；负值恢复跟随系统——02 §4.8 退出播放页恢复 -1 的契约）。
    // AsyncFunction 在模块队列线程执行，而 Window 属性受 ViewRootImpl 线程校验，
    // 必须在主线程写入（否则抛 "Only the original thread ... can touch its views"）
    AsyncFunction("setWindowBrightness") { value: Double, promise: Promise ->
      try {
        val activity = currentActivity
        activity.runOnUiThread {
          try {
            val window = activity.window
            val attributes = window.attributes
            // -1 = BRIGHTNESS_OVERRIDE_NONE 跟随系统；不得对 -1 取 coerceIn(0..1)（会被钉在最低亮度）
            attributes.screenBrightness = if (value < 0) {
              WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            } else {
              value.toFloat().coerceIn(0f, 1f)
            }
            window.attributes = attributes
            promise.resolve(null)
          } catch (e: Exception) {
            promise.reject(CodedException(e.message ?: "设置窗口亮度失败"))
          }
        }
      } catch (e: Exception) {
        promise.reject(CodedException(e.message ?: "设置窗口亮度失败"))
      }
    }

    // 读窗口亮度（0..1；-1 表示跟随系统）；同 setWindowBrightness 需在主线程读取
    AsyncFunction("getWindowBrightness") { promise: Promise ->
      try {
        val activity = currentActivity
        activity.runOnUiThread {
          try {
            promise.resolve(activity.window.attributes.screenBrightness.toDouble())
          } catch (e: Exception) {
            promise.reject(CodedException(e.message ?: "读取窗口亮度失败"))
          }
        }
      } catch (e: Exception) {
        promise.reject(CodedException(e.message ?: "读取窗口亮度失败"))
      }
    }

    // 设置媒体音量（0..1，内部按 maxStreamVolume 折算）
    AsyncFunction("setMusicVolume") { volume: Double, promise: Promise ->
      try {
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = Math.round(volume.coerceIn(0.0, 1.0) * max).toInt()
        // 不带 FLAG_SHOW_UI：系统音量条由播放页自绘气泡替代
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject(CodedException(e.message ?: "设置媒体音量失败"))
      }
    }

    // 读媒体音量（0..1）
    AsyncFunction("getMusicVolume") { promise: Promise ->
      try {
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (max <= 0) {
          promise.resolve(0.0)
        } else {
          promise.resolve(audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max)
        }
      } catch (e: Exception) {
        promise.reject(CodedException(e.message ?: "读取媒体音量失败"))
      }
    }
  }
}
