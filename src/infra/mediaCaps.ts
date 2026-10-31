/**
 * 解码能力探测 JS 封装（M3 文档 §4.4.3）：进程内缓存 + 失败回退。
 * 设备解码能力运行期不变，进程内缓存即可、不进 MMKV；并发调用合并为一次原生探测。
 * 模块调用失败/异常回退全 false——即 h264-only 直连、其余全转码，可用性优先
 * （对齐设计文档 §8.2「异常机型关掉即全量转码兜底」；代价仅服务器 CPU，不影响可看性）。
 */
import type { DecoderCapabilities } from '@/adapter/DeviceProfileBuilder';
import { getDecoderCapabilities } from '../../modules/expo-media-caps';

/** 探测失败回退值：全 false（全转码兜底） */
const FALLBACK_CAPS: DecoderCapabilities = {
  supportsHevcMain10: false,
  supportsVp9: false,
  supportsAv1: false,
};

/** 进程内缓存（探测一次后固定） */
let cached: DecoderCapabilities | null = null;

/** 并发去重：首个调用进行中的 Promise（后续调用直接复用） */
let pending: Promise<DecoderCapabilities> | null = null;

/**
 * 取解码能力（带缓存）：首次经原生模块探测，之后直接命中缓存；
 * 原生调用异常回退 FALLBACK_CAPS 并缓存（设备能力不变，失败结果同样固定）。
 */
export function fetchDecoderCaps(): Promise<DecoderCapabilities> {
  if (cached !== null) {
    return Promise.resolve(cached);
  }
  if (pending === null) {
    pending = getDecoderCapabilities()
      .then((caps) => {
        cached = caps;
        return caps;
      })
      .catch(() => {
        console.warn('[mediaCaps] 解码能力探测失败，回退全转码兜底');
        cached = FALLBACK_CAPS;
        return cached;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
