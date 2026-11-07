package expo.modules.playersnapshot

import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * 播放截图原生模块：遍历 Activity 视图树找 ExoPlayer 的 SurfaceView，PixelCopy 抓当前帧
 * 写 cacheDir PNG（SurfaceView 重载 API 26+，与 minSdk 26 一致）。只拷视频 Surface，
 * 不含控制层；JS 侧负责入系统相册与删临时文件。
 */
class PlayerSnapshotModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoPlayerSnapshot")

    AsyncFunction("capture") { promise: Promise ->
      val activity = appContext.activityProvider?.currentActivity
      if (activity == null) {
        promise.reject(CodedException("无当前 Activity"))
      } else {
        // PixelCopy 与视图读取须主线程
        activity.runOnUiThread {
          val surface = findSurfaceView(activity.window.decorView)
          if (surface == null || surface.width <= 0 || surface.height <= 0) {
            promise.reject(CodedException("未找到播放画面"))
          } else {
            val bitmap = Bitmap.createBitmap(surface.width, surface.height, Bitmap.Config.ARGB_8888)
            val listener = object : PixelCopy.OnPixelCopyFinishedListener {
              override fun onPixelCopyFinished(copyResult: Int) {
                if (copyResult != PixelCopy.SUCCESS) {
                  bitmap.recycle()
                  promise.reject(CodedException("抓帧失败"))
                  return
                }
                try {
                  val file = File(activity.cacheDir, "player-snapshot-${System.currentTimeMillis()}.png")
                  FileOutputStream(file).use { output ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
                  }
                  promise.resolve(file.absolutePath)
                } catch (e: Exception) {
                  promise.reject(CodedException(e.message ?: "保存截图失败"))
                } finally {
                  bitmap.recycle()
                }
              }
            }
            try {
              PixelCopy.request(surface, bitmap, listener, Handler(Looper.getMainLooper()))
            } catch (e: Exception) {
              bitmap.recycle()
              promise.reject(CodedException(e.message ?: "抓帧失败"))
            }
          }
        }
      }
    }
  }

  /** 深度优先找 SurfaceView（react-native-video 的 media3 PlayerView 默认 surface_view） */
  private fun findSurfaceView(view: View): SurfaceView? {
    if (view is SurfaceView) {
      return view
    }
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val found = findSurfaceView(view.getChildAt(i))
        if (found != null) {
          return found
        }
      }
    }
    return null
  }
}