package expo.modules.mediacaps

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 解码能力探测原生模块（M3 文档 §4.4.3）：MediaCodecList(ALL_CODECS) 判定三项能力。
 * - supportsHevcMain10：存在 video/hevc 解码器且 profileLevels 含 HEVCProfileMain10（值 2）
 *   或其 HDR 变体（HDR10=4096 / HDR10Plus=8192）——仅 8bit Main profile 不算，10bit 片直连花屏即此判定规避；
 * - supportsVp9：supportedTypes 含 video/x-vnd.on2.vp9；
 * - supportsAv1：supportedTypes 含 video/av01 且 isHardwareAccelerated（API 29+ 属性，
 *   minSdk 26 的 26–28 设备一律 false；AV1 仅认硬解，软解性能不可接受）。
 * 判定集合为全部非 encoder 的解码器。
 */
class MediaCapsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMediaCaps")

    AsyncFunction("getDecoderCapabilities") { promise: Promise ->
      try {
        val decoders = MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.filter { !it.isEncoder }
        var hevcMain10 = false
        var vp9 = false
        var av1 = false
        for (info in decoders) {
          for (type in info.supportedTypes) {
            when (type) {
              "video/hevc" -> {
                if (!hevcMain10) {
                  val capabilities = info.getCapabilitiesForType("video/hevc")
                  hevcMain10 = capabilities.profileLevels.any { isHevcMain10Family(it.profile) }
                }
              }
              // 常量与 "video/x-vnd.on2.vp9" 等价，用字面量与设计文档词表保持一致
              "video/x-vnd.on2.vp9" -> vp9 = true
              "video/av01" -> {
                if (!av1 && Build.VERSION.SDK_INT >= 29 && info.isHardwareAccelerated) {
                  av1 = true
                }
              }
            }
          }
        }
        promise.resolve(
          mapOf(
            "supportsHevcMain10" to hevcMain10,
            "supportsVp9" to vp9,
            "supportsAv1" to av1
          )
        )
      } catch (e: Exception) {
        promise.reject(CodedException(e.message ?: "解码能力探测失败"))
      }
    }
  }

  /** HEVC Main10 及其 HDR 变体判定（仅 8bit Main profile 不算） */
  private fun isHevcMain10Family(profile: Int): Boolean {
    return (
      profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10 ||
        profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10 ||
        profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10Plus
      )
  }
}
