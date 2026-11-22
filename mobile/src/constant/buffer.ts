/**
 * 视频缓冲档位（预设 + 自定义）：消费 react-native-video 的 source.bufferConfig（ExoPlayer
 * DefaultLoadControl）。档位携带协调好的参数 bundle，避免秒/MB/百分比三旋钮互相打架：
 * 时间上限（min/maxBufferMs）与字节上限（targetBufferBytes）由 prioritizeTimeOverSizeThresholds
 * 决定谁优先——true 仅按时长（字节忽略）、false 时长/字节任一先到即停。
 * 常量层不引 react-native-video 运行时（策略以字符串键存储，与 BufferingStrategyType 值一致），
 * 派生见 util/buffer.ts，播放页边界再映射枚举，避免单测加载原生模块。
 */
import type { MessageKey } from '@/i18n/messages/zh';

/** 缓冲档位键（settingsStore.bufferTier 持久化值） */
export type BufferTierKey = 'DATA_SAVER' | 'BALANCED' | 'SMOOTH' | 'UNLIMITED' | 'CUSTOM';

/** 缓冲策略键（与 react-native-video BufferingStrategyType 字符串值一致） */
export type BufferingStrategyKey = 'Default' | 'DependingOnMemory';

/** 起播缓冲门槛（毫秒，Media3 默认 1s） */
export const BUFFER_PLAYBACK_START_MS = 1000;
/** 重缓冲后恢复门槛（毫秒，Media3 默认 2s） */
export const BUFFER_PLAYBACK_AFTER_REBUFFER_MS = 2000;
/** MB → 字节换算 */
export const BYTES_PER_MB = 1024 * 1024;
/** 不限字节哨兵（= Media3 C.LENGTH_UNSET） */
export const BUFFER_BYTES_UNLIMITED = -1;

export interface BufferTier {
  key: BufferTierKey;
  labelKey: MessageKey;
  /** 档位策略说明（弹层选项标签下方小字） */
  descKey: MessageKey;
  minBufferMs: number;
  maxBufferMs: number;
  bufferForPlaybackMs: number;
  bufferForPlaybackAfterRebufferMs: number;
  /** 回退缓冲（毫秒）：保留当前点之前的媒体供快速回 seek */
  backBufferDurationMs: number;
  /** 内存缓冲字节上限；-1 = 不限 */
  targetBufferBytes: number;
  prioritizeTimeOverSizeThresholds: boolean;
  bufferingStrategy: BufferingStrategyKey;
}

export const BUFFER_TIER_MAP: Record<BufferTierKey, BufferTier> = {
  // 省流：小缓冲 + 50MB 字节封顶（prioritize=false 让字节上限生效），适合蜂窝
  DATA_SAVER: {
    key: 'DATA_SAVER',
    labelKey: 'buffer.dataSaver',
    descKey: 'buffer.dataSaverDesc',
    minBufferMs: 15_000,
    maxBufferMs: 15_000,
    bufferForPlaybackMs: BUFFER_PLAYBACK_START_MS,
    bufferForPlaybackAfterRebufferMs: BUFFER_PLAYBACK_AFTER_REBUFFER_MS,
    backBufferDurationMs: 5_000,
    targetBufferBytes: 50 * BYTES_PER_MB,
    prioritizeTimeOverSizeThresholds: false,
    bufferingStrategy: 'Default',
  },
  BALANCED: {
    key: 'BALANCED',
    labelKey: 'buffer.balanced',
    descKey: 'buffer.balancedDesc',
    minBufferMs: 30_000,
    maxBufferMs: 30_000,
    bufferForPlaybackMs: BUFFER_PLAYBACK_START_MS,
    bufferForPlaybackAfterRebufferMs: BUFFER_PLAYBACK_AFTER_REBUFFER_MS,
    backBufferDurationMs: 10_000,
    targetBufferBytes: BUFFER_BYTES_UNLIMITED,
    prioritizeTimeOverSizeThresholds: true,
    bufferingStrategy: 'Default',
  },
  // 顺滑（默认）：保留 ExoPlayer 默认 50s + 补回退缓冲 15s 改善回 seek
  SMOOTH: {
    key: 'SMOOTH',
    labelKey: 'buffer.smooth',
    descKey: 'buffer.smoothDesc',
    minBufferMs: 50_000,
    maxBufferMs: 50_000,
    bufferForPlaybackMs: BUFFER_PLAYBACK_START_MS,
    bufferForPlaybackAfterRebufferMs: BUFFER_PLAYBACK_AFTER_REBUFFER_MS,
    backBufferDurationMs: 15_000,
    targetBufferBytes: BUFFER_BYTES_UNLIMITED,
    prioritizeTimeOverSizeThresholds: true,
    bufferingStrategy: 'Default',
  },
  // 不设限：大缓冲（10min 封顶）+ 内存安全阀（DependingOnMemory）防高码率 OOM
  UNLIMITED: {
    key: 'UNLIMITED',
    labelKey: 'buffer.unlimited',
    descKey: 'buffer.unlimitedDesc',
    minBufferMs: 50_000,
    maxBufferMs: 600_000,
    bufferForPlaybackMs: BUFFER_PLAYBACK_START_MS,
    bufferForPlaybackAfterRebufferMs: BUFFER_PLAYBACK_AFTER_REBUFFER_MS,
    backBufferDurationMs: 30_000,
    targetBufferBytes: BUFFER_BYTES_UNLIMITED,
    prioritizeTimeOverSizeThresholds: true,
    bufferingStrategy: 'DependingOnMemory',
  },
  // 自定义：bundle 仅占位（labelKey 供 UI），实际参数由 buildBufferSettings 按用户输入推导
  CUSTOM: {
    key: 'CUSTOM',
    labelKey: 'buffer.custom',
    descKey: 'buffer.customDesc',
    minBufferMs: 50_000,
    maxBufferMs: 50_000,
    bufferForPlaybackMs: BUFFER_PLAYBACK_START_MS,
    bufferForPlaybackAfterRebufferMs: BUFFER_PLAYBACK_AFTER_REBUFFER_MS,
    backBufferDurationMs: 15_000,
    targetBufferBytes: BUFFER_BYTES_UNLIMITED,
    prioritizeTimeOverSizeThresholds: true,
    bufferingStrategy: 'Default',
  },
};

/** 菜单顺序即定义顺序（设置页档位弹层消费） */
export const BUFFER_TIER_LIST = (Object.keys(BUFFER_TIER_MAP) as BufferTierKey[]).map(
  (key) => BUFFER_TIER_MAP[key]
);

/** 默认档位：顺滑（保留 50s 缓冲 + 回退缓冲改善） */
export const DEFAULT_BUFFER_TIER: BufferTierKey = 'SMOOTH';

// —— 自定义边界（settingsStore 落盘 clamp 与 util 推导共用）——
export const CUSTOM_BUFFER_SECONDS_MIN = 5;
export const CUSTOM_BUFFER_SECONDS_MAX = 600;
export const CUSTOM_BUFFER_SECONDS_DEFAULT = 50;
export const CUSTOM_BUFFER_PERCENT_MIN = 1;
export const CUSTOM_BUFFER_PERCENT_MAX = 100;
export const CUSTOM_BUFFER_PERCENT_DEFAULT = 10;
/** MB=0 表示不限字节 */
export const CUSTOM_BUFFER_MB_MIN = 0;
export const CUSTOM_BUFFER_MB_MAX = 2048;
export const CUSTOM_BUFFER_MB_DEFAULT = 0;
/** 自定义回拖缓冲（秒）：保留当前点之前的媒体供快速回 seek；0 = 不保留 */
export const CUSTOM_BUFFER_BACK_SECONDS_MIN = 0;
export const CUSTOM_BUFFER_BACK_SECONDS_MAX = 120;
export const CUSTOM_BUFFER_BACK_SECONDS_DEFAULT = 15;
/** 自定义回拖缓冲百分比边界（按片长%） */
export const CUSTOM_BUFFER_BACK_PERCENT_MIN = 1;
export const CUSTOM_BUFFER_BACK_PERCENT_MAX = 100;
export const CUSTOM_BUFFER_BACK_PERCENT_DEFAULT = 5;
/** 自定义 maxBufferMs 钳制区间（防片长百分比算出过量缓冲） */
export const CUSTOM_BUFFER_MS_MIN = 5_000;
export const CUSTOM_BUFFER_MS_MAX = 600_000;