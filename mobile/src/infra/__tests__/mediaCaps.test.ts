/**
 * 解码能力探测 JS 封装单测（M3 §5 S2「人为抛错验证全 false 回退」的 jest 形态）：
 * 正常路径缓存命中（原生只探一次）、并发合并、失败回退全 false 且缓存固定。
 * 模块级缓存跨用例隔离：每用例 resetModules 后动态加载被测模块的新实例。
 */
import type { DecoderCapabilities } from '@/adapter/DeviceProfileBuilder';

const mockGet = jest.fn();

jest.mock('../../../../modules/expo-media-caps', () => ({
  getDecoderCapabilities: mockGet,
}));

/** 动态加载被测模块（缓存态随 resetModules 归零；jest CJS 环境用 require） */
function loadModule(): typeof import('@/infra/mediaCaps') {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- resetModules 后只能同步 require 取新实例
  return require('@/infra/mediaCaps') as typeof import('@/infra/mediaCaps');
}

describe('infra/mediaCaps（缓存 + 回退）', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('正常探测：结果缓存，第二次调用不再触原生', async () => {
    const caps: DecoderCapabilities = {
      supportsHevcMain10: true,
      supportsVp9: true,
      supportsAv1: false,
    };
    mockGet.mockResolvedValue(caps);
    const { fetchDecoderCaps } = await loadModule();
    const first = await fetchDecoderCaps();
    const second = await fetchDecoderCaps();
    expect(first).toEqual({ supportsHevcMain10: true, supportsVp9: true, supportsAv1: false });
    expect(second).toBe(first);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('并发调用合并为一次原生探测', async () => {
    mockGet.mockResolvedValue({
      supportsHevcMain10: false,
      supportsVp9: false,
      supportsAv1: false,
    });
    const { fetchDecoderCaps } = await loadModule();
    const [a, b] = await Promise.all([fetchDecoderCaps(), fetchDecoderCaps()]);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('原生抛错 → 回退全 false（h264-only 直连、其余全转码兜底）并缓存', async () => {
    mockGet.mockRejectedValue(new Error('原生模块不可用'));
    const { fetchDecoderCaps } = await loadModule();
    const fallback = await fetchDecoderCaps();
    expect(fallback).toEqual({ supportsHevcMain10: false, supportsVp9: false, supportsAv1: false });
    // 失败结果同样固定（设备能力不变）
    const again = await fetchDecoderCaps();
    expect(again).toBe(fallback);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
