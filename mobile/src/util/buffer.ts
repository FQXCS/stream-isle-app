/**
 * 缓冲配置派生（纯函数）：把档位/自定义设置换算为 react-native-video 的 source.bufferConfig
 * 与 bufferingStrategy。预设直接取 constant/buffer.ts 的 bundle；自定义按协调模型推导：
 * - 时间上限：秒 与 片长% 二选一（timeMode）；% 按 runTimeMs 算，未知时长回退秒数；
 * - 字节上限：MB>0 → targetBufferBytes 生效且 prioritizeTime=false（时长/字节任一先到即停）；
 *   MB=0 → 不限字节且 prioritizeTime=true（仅按时长）；
 * - 合法性 clamp：min≤max、起播/重缓冲阈值≤max、maxBufferMs 落在 [CUSTOM_BUFFER_MS_MIN, MAX]。
 * 对 react-native-video 仅 import type（运行时擦除），单测不加载原生模块。
 */
import type { BufferConfig } from 'react-native-video';

import {
  BUFFER_PLAYBACK_AFTER_REBUFFER_MS,
  BUFFER_PLAYBACK_START_MS,
  BUFFER_TIER_MAP,
  BYTES_PER_MB,
  CUSTOM_BUFFER_BACK_PERCENT_DEFAULT,
  CUSTOM_BUFFER_BACK_PERCENT_MAX,
  CUSTOM_BUFFER_BACK_PERCENT_MIN,
  CUSTOM_BUFFER_BACK_SECONDS_DEFAULT,
  CUSTOM_BUFFER_BACK_SECONDS_MAX,
  CUSTOM_BUFFER_BACK_SECONDS_MIN,
  CUSTOM_BUFFER_MB_DEFAULT,
  CUSTOM_BUFFER_MB_MAX,
  CUSTOM_BUFFER_MB_MIN,
  CUSTOM_BUFFER_MS_MAX,
  CUSTOM_BUFFER_MS_MIN,
  CUSTOM_BUFFER_PERCENT_DEFAULT,
  CUSTOM_BUFFER_PERCENT_MAX,
  CUSTOM_BUFFER_PERCENT_MIN,
  CUSTOM_BUFFER_SECONDS_DEFAULT,
  CUSTOM_BUFFER_SECONDS_MAX,
  CUSTOM_BUFFER_SECONDS_MIN,
  BUFFER_BYTES_UNLIMITED,
  type BufferTierKey,
  type BufferingStrategyKey,
} from '@/constant/buffer';

/** 自定义缓冲设置（settingsStore.customBuffer 持久化形态） */
export interface CustomBufferSettings {
  /** 时间上限输入模式：秒 或 片长百分比（二选一） */
  timeMode: 'seconds' | 'percent';
  seconds: number;
  percent: number;
  /** 内存缓冲上限 MB；0 = 不限 */
  mb: number;
  /** 回拖缓冲输入模式：秒 或 片长百分比（二选一） */
  backTimeMode: 'seconds' | 'percent';
  /** 回拖缓冲秒数（保留当前点之前供快速回 seek）；0 = 不保留 */
  backSeconds: number;
  backPercent: number;
}

export const DEFAULT_CUSTOM_BUFFER: CustomBufferSettings = {
  timeMode: 'seconds',
  seconds: CUSTOM_BUFFER_SECONDS_DEFAULT,
  percent: CUSTOM_BUFFER_PERCENT_DEFAULT,
  mb: CUSTOM_BUFFER_MB_DEFAULT,
  backTimeMode: 'seconds',
  backSeconds: CUSTOM_BUFFER_BACK_SECONDS_DEFAULT,
  backPercent: CUSTOM_BUFFER_BACK_PERCENT_DEFAULT,
};

/** 派生结果：bufferConfig 挂 source 内，bufferingStrategy 为顶层 prop（播放页映射枚举） */
export interface BufferSettings {
  bufferConfig: BufferConfig;
  bufferingStrategy: BufferingStrategyKey;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 自定义设置归一（clamp 各字段到边界）：settingsStore 落盘与派生共用，杜绝两处语义分叉 */
export function clampCustomBuffer(custom: CustomBufferSettings): CustomBufferSettings {
  return {
    timeMode: custom.timeMode === 'percent' ? 'percent' : 'seconds',
    seconds: clamp(custom.seconds, CUSTOM_BUFFER_SECONDS_MIN, CUSTOM_BUFFER_SECONDS_MAX),
    percent: clamp(custom.percent, CUSTOM_BUFFER_PERCENT_MIN, CUSTOM_BUFFER_PERCENT_MAX),
    mb: clamp(custom.mb, CUSTOM_BUFFER_MB_MIN, CUSTOM_BUFFER_MB_MAX),
    backTimeMode: custom.backTimeMode === 'percent' ? 'percent' : 'seconds',
    backSeconds: clamp(custom.backSeconds, CUSTOM_BUFFER_BACK_SECONDS_MIN, CUSTOM_BUFFER_BACK_SECONDS_MAX),
    backPercent: clamp(custom.backPercent, CUSTOM_BUFFER_BACK_PERCENT_MIN, CUSTOM_BUFFER_BACK_PERCENT_MAX),
  };
}

/**
 * 派生缓冲配置。runTimeMs 取会话时长（起播前可得，optional）；仅自定义百分比模式消费。
 */
export function buildBufferSettings(
  tier: BufferTierKey,
  custom: CustomBufferSettings,
  runTimeMs?: number
): BufferSettings {
  if (tier !== 'CUSTOM') {
    const preset = BUFFER_TIER_MAP[tier];
    return {
      bufferConfig: {
        minBufferMs: preset.minBufferMs,
        maxBufferMs: preset.maxBufferMs,
        bufferForPlaybackMs: preset.bufferForPlaybackMs,
        bufferForPlaybackAfterRebufferMs: preset.bufferForPlaybackAfterRebufferMs,
        backBufferDurationMs: preset.backBufferDurationMs,
        targetBufferBytes: preset.targetBufferBytes,
        prioritizeTimeOverSizeThresholds: preset.prioritizeTimeOverSizeThresholds,
      },
      bufferingStrategy: preset.bufferingStrategy,
    };
  }

  const { timeMode, seconds, percent, mb, backTimeMode, backSeconds, backPercent } = clampCustomBuffer(custom);

  // 时间上限：百分比模式且时长有效 → 片长×%；否则（秒模式/时长未知）回退秒数
  const rawMaxMs =
    timeMode === 'percent' && runTimeMs !== undefined && runTimeMs > 0
      ? Math.round((runTimeMs * percent) / 100)
      : seconds * 1000;
  const maxBufferMs = clamp(rawMaxMs, CUSTOM_BUFFER_MS_MIN, CUSTOM_BUFFER_MS_MAX);

  // 回拖缓冲：百分比模式且时长有效 → 片长×%；否则回退秒数；钳制 [0, CUSTOM_BUFFER_MS_MAX]
  const rawBackMs =
    backTimeMode === 'percent' && runTimeMs !== undefined && runTimeMs > 0
      ? Math.round((runTimeMs * backPercent) / 100)
      : backSeconds * 1000;
  const backBufferMs = clamp(rawBackMs, 0, CUSTOM_BUFFER_MS_MAX);

  // 字节上限：MB>0 生效并让字节优先（prioritize=false）；MB=0 不限字节仅按时长
  const hasByteCap = mb > 0;
  return {
    bufferConfig: {
      minBufferMs: maxBufferMs,
      maxBufferMs,
      bufferForPlaybackMs: Math.min(BUFFER_PLAYBACK_START_MS, maxBufferMs),
      bufferForPlaybackAfterRebufferMs: Math.min(BUFFER_PLAYBACK_AFTER_REBUFFER_MS, maxBufferMs),
      backBufferDurationMs: backBufferMs,
      targetBufferBytes: hasByteCap ? mb * BYTES_PER_MB : BUFFER_BYTES_UNLIMITED,
      prioritizeTimeOverSizeThresholds: !hasByteCap,
    },
    bufferingStrategy: 'Default',
  };
}