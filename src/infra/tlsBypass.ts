/**
 * TLS 白名单与诊断的 JS 封装（04 §4.6 终态命名；原生宿主为 M1 classic module
 * `StreamIsleNetwork`，04 复用不新建）。由 M1 的 src/infra/native/StreamIsleNetwork.ts
 * 升级而来：白名单键 host → host:port（入参改为规范化 baseUrl 列表，逐条经
 * normalizeUrl.toHostPort 解析）。
 * 1) 证书白名单：syncTlsBypassHosts(baseUrlList)——settingsStore.allowInsecureTls
 *    （规范化 baseUrl 键）全量回同步原生；
 * 2) probe 诊断：probeTls(url) → "OK" | "TLS_FAIL" | "UNREACHABLE"——TLS 细分的精确机制，
 *    由 AuthService.connect 在探测链路消费，不作正式请求通道。
 */
import { NativeModules } from 'react-native';

import { toHostPort } from '@/util/normalizeUrl';

/** 原生模块契约（Kotlin 侧同名方法） */
interface StreamIsleNetworkNativeModule {
  /** 全量覆写原生白名单（host:port 集合，04 §4.6） */
  setBypassHosts(hostList: string[]): void;

  /** trust-all 专用 client 发一次 HEAD 诊断；promise resolve: OK / TLS_FAIL / UNREACHABLE */
  probe(url: string): Promise<'OK' | 'TLS_FAIL' | 'UNREACHABLE'>;
}

/** 取原生模块；缺失（单测/非原生环境）返回 null，调用方按需兜底 */
function nativeModule(): StreamIsleNetworkNativeModule | null {
  const module = NativeModules.StreamIsleNetwork as StreamIsleNetworkNativeModule | undefined;
  return module ?? null;
}

/**
 * 同步证书白名单到原生（全量覆写）：入参为规范化 baseUrl 列表（settingsStore 白名单键），
 * 逐条解析为 host:port（显式端口保留、缺省按协议补齐、子路径只取 host）并去重后传原生。
 * 非法/不可解析条目跳过（白名单允许存在「试探过但未完成登录」的孤儿条目，04 §4.6）。
 */
export function syncTlsBypassHosts(baseUrlList: string[]): void {
  const module = nativeModule();
  if (!module) {
    // 非原生环境（单测）：跳过；真机上模块必然注册
    return;
  }
  const hostSet = new Set<string>();
  baseUrlList.forEach((baseUrl) => {
    const hostPort = toHostPort(baseUrl);
    if (hostPort !== null) {
      hostSet.add(hostPort);
    }
  });
  module.setBypassHosts(Array.from(hostSet));
}

/** 原生 probe 诊断结果 */
export type TlsProbeResult = 'OK' | 'TLS_FAIL' | 'UNREACHABLE';

/**
 * 对目标 url 发一次 trust-all HEAD 诊断。
 * 原生异常（模块缺失/桥错误）按 UNREACHABLE 处理，细分仍由 connect 链路归一化。
 */
export async function probeTls(url: string): Promise<TlsProbeResult> {
  const module = nativeModule();
  if (!module) {
    return 'UNREACHABLE';
  }
  try {
    return await module.probe(url);
  } catch {
    return 'UNREACHABLE';
  }
}
