/**
 * expo-media-caps TS 出口（M3 文档 §4.4.3）：Android 解码能力探测。
 * Kotlin 侧用 MediaCodecList(ALL_CODECS) 判定 HEVC Main10 / VP9 / AV1（仅硬解）；
 * JS 封装（缓存/回退）在 src/infra/mediaCaps.ts，本文件只做原生桥。
 */
import { requireNativeModule } from 'expo-modules-core';
import type { DecoderCapabilities } from '@/adapter/DeviceProfileBuilder';

/** 原生模块方法形态（与 MediaCapsModule.kt 定义一致） */
interface MediaCapsModuleType {
  /** 一次探测返回三项能力（进程内缓存在 JS 侧） */
  getDecoderCapabilities(): Promise<DecoderCapabilities>;
}

const nativeModule = requireNativeModule<MediaCapsModuleType>('ExpoMediaCaps');

/** 探测 Android 解码能力（原生调用；失败回退由 infra/mediaCaps 处理） */
export function getDecoderCapabilities(): Promise<DecoderCapabilities> {
  return nativeModule.getDecoderCapabilities();
}

export default nativeModule;
