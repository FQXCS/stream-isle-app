/**
 * 缓冲配置派生单测：预设档位取 map bundle；自定义秒/百分比/MB 协调模型与 clamp；
 * Media3 合法性约束（min≤max、起播/重缓冲阈值≤max、字节>0 或 -1、maxBuffer 区间）。
 */
import {
  BUFFER_TIER_MAP,
  BYTES_PER_MB,
  CUSTOM_BUFFER_BACK_SECONDS_DEFAULT,
  CUSTOM_BUFFER_BACK_SECONDS_MAX,
  CUSTOM_BUFFER_MS_MAX,
  CUSTOM_BUFFER_MS_MIN,
  CUSTOM_BUFFER_SECONDS_MAX,
  CUSTOM_BUFFER_SECONDS_MIN,
} from '@/constant/buffer';
import {
  buildBufferSettings,
  DEFAULT_CUSTOM_BUFFER,
  type CustomBufferSettings,
} from '@/util/buffer';

function custom(overrides: Partial<CustomBufferSettings> = {}): CustomBufferSettings {
  return { ...DEFAULT_CUSTOM_BUFFER, ...overrides };
}

describe('buildBufferSettings 预设档位', () => {
  it('省流：15s + 50MB 字节封顶 + prioritize=false', () => {
    const { bufferConfig, bufferingStrategy } = buildBufferSettings('DATA_SAVER', DEFAULT_CUSTOM_BUFFER);
    expect(bufferConfig.maxBufferMs).toBe(15_000);
    expect(bufferConfig.minBufferMs).toBe(15_000);
    expect(bufferConfig.targetBufferBytes).toBe(50 * BYTES_PER_MB);
    expect(bufferConfig.prioritizeTimeOverSizeThresholds).toBe(false);
    expect(bufferingStrategy).toBe('Default');
  });

  it('顺滑（默认）：50s + 不限字节 + prioritize=true + 回退缓冲 15s', () => {
    const { bufferConfig } = buildBufferSettings('SMOOTH', DEFAULT_CUSTOM_BUFFER);
    expect(bufferConfig.maxBufferMs).toBe(50_000);
    expect(bufferConfig.targetBufferBytes).toBe(-1);
    expect(bufferConfig.prioritizeTimeOverSizeThresholds).toBe(true);
    expect(bufferConfig.backBufferDurationMs).toBe(15_000);
  });

  it('不设限：600s 大缓冲 + 内存安全阀策略', () => {
    const { bufferConfig, bufferingStrategy } = buildBufferSettings('UNLIMITED', DEFAULT_CUSTOM_BUFFER);
    expect(bufferConfig.maxBufferMs).toBe(600_000);
    expect(bufferingStrategy).toBe('DependingOnMemory');
  });

  it('预设参数与档位 map 一致', () => {
    const preset = BUFFER_TIER_MAP.BALANCED;
    const { bufferConfig } = buildBufferSettings('BALANCED', DEFAULT_CUSTOM_BUFFER);
    expect(bufferConfig).toMatchObject({
      minBufferMs: preset.minBufferMs,
      maxBufferMs: preset.maxBufferMs,
      bufferForPlaybackMs: preset.bufferForPlaybackMs,
      bufferForPlaybackAfterRebufferMs: preset.bufferForPlaybackAfterRebufferMs,
      backBufferDurationMs: preset.backBufferDurationMs,
      targetBufferBytes: preset.targetBufferBytes,
      prioritizeTimeOverSizeThresholds: preset.prioritizeTimeOverSizeThresholds,
    });
  });
});

describe('buildBufferSettings 自定义', () => {
  it('秒模式：maxBuffer=秒×1000，min=max，不限字节 prioritize=true', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ timeMode: 'seconds', seconds: 30 }));
    expect(bufferConfig.maxBufferMs).toBe(30_000);
    expect(bufferConfig.minBufferMs).toBe(30_000);
    expect(bufferConfig.targetBufferBytes).toBe(-1);
    expect(bufferConfig.prioritizeTimeOverSizeThresholds).toBe(true);
    expect(bufferConfig.backBufferDurationMs).toBe(CUSTOM_BUFFER_BACK_SECONDS_DEFAULT * 1000);
  });

  it('百分比模式：maxBuffer=片长×%（10min 片长 10% = 60s）', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ timeMode: 'percent', percent: 10 }), 600_000);
    expect(bufferConfig.maxBufferMs).toBe(60_000);
  });

  it('百分比模式时长未知：回退秒数', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ timeMode: 'percent', percent: 50, seconds: 20 }));
    expect(bufferConfig.maxBufferMs).toBe(20_000);
  });

  it('百分比模式时长为 0：回退秒数', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ timeMode: 'percent', seconds: 25 }), 0);
    expect(bufferConfig.maxBufferMs).toBe(25_000);
  });

  it('MB>0：字节上限生效 + prioritize=false', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ mb: 100 }));
    expect(bufferConfig.targetBufferBytes).toBe(100 * BYTES_PER_MB);
    expect(bufferConfig.prioritizeTimeOverSizeThresholds).toBe(false);
  });

  it('MB=0：不限字节 + prioritize=true', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ mb: 0 }));
    expect(bufferConfig.targetBufferBytes).toBe(-1);
    expect(bufferConfig.prioritizeTimeOverSizeThresholds).toBe(true);
  });

  it('回拖缓冲：backSeconds×1000，0=不保留，越界 clamp', () => {
    expect(buildBufferSettings('CUSTOM', custom({ backSeconds: 30 })).bufferConfig.backBufferDurationMs).toBe(30_000);
    expect(buildBufferSettings('CUSTOM', custom({ backSeconds: 0 })).bufferConfig.backBufferDurationMs).toBe(0);
    expect(buildBufferSettings('CUSTOM', custom({ backSeconds: 9999 })).bufferConfig.backBufferDurationMs).toBe(
      CUSTOM_BUFFER_BACK_SECONDS_MAX * 1000
    );
  });

  it('回拖缓冲百分比：片长×%，时长未知回退秒数', () => {
    // 10min 片长 × 5% = 30s
    expect(
      buildBufferSettings('CUSTOM', custom({ backTimeMode: 'percent', backPercent: 5 }), 600_000).bufferConfig
        .backBufferDurationMs
    ).toBe(30_000);
    // 时长未知回退 backSeconds
    expect(
      buildBufferSettings('CUSTOM', custom({ backTimeMode: 'percent', backPercent: 50, backSeconds: 20 })).bufferConfig
        .backBufferDurationMs
    ).toBe(20_000);
  });

  it('秒数 clamp：低于下限取下限、高于上限取上限', () => {
    expect(buildBufferSettings('CUSTOM', custom({ seconds: 1 })).bufferConfig.maxBufferMs).toBe(
      CUSTOM_BUFFER_SECONDS_MIN * 1000
    );
    expect(buildBufferSettings('CUSTOM', custom({ seconds: 9999 })).bufferConfig.maxBufferMs).toBe(
      CUSTOM_BUFFER_SECONDS_MAX * 1000
    );
  });

  it('百分比算出过量缓冲：maxBuffer 钳制到上限（2h×100% → 600s）', () => {
    const { bufferConfig } = buildBufferSettings('CUSTOM', custom({ timeMode: 'percent', percent: 100 }), 7_200_000);
    expect(bufferConfig.maxBufferMs).toBe(CUSTOM_BUFFER_MS_MAX);
  });

  it('Media3 合法性：min≤max、起播/重缓冲阈值≤max、字节>0 或 -1、maxBuffer 区间', () => {
    const cases: CustomBufferSettings[] = [
      custom({ seconds: CUSTOM_BUFFER_SECONDS_MIN }),
      custom({ timeMode: 'percent', percent: 1 }),
      custom({ mb: 1 }),
      custom({ seconds: 9999, mb: 2048 }),
    ];
    for (const c of cases) {
      const { bufferConfig } = buildBufferSettings('CUSTOM', c, 600_000);
      const max = bufferConfig.maxBufferMs ?? 0;
      expect(bufferConfig.minBufferMs ?? 0).toBeLessThanOrEqual(max);
      expect(bufferConfig.bufferForPlaybackMs ?? 0).toBeLessThanOrEqual(max);
      expect(bufferConfig.bufferForPlaybackAfterRebufferMs ?? 0).toBeLessThanOrEqual(max);
      expect(max).toBeGreaterThanOrEqual(CUSTOM_BUFFER_MS_MIN);
      expect(max).toBeLessThanOrEqual(CUSTOM_BUFFER_MS_MAX);
      const bytes = bufferConfig.targetBufferBytes ?? -1;
      expect(bytes === -1 || bytes > 0).toBe(true);
    }
  });
});