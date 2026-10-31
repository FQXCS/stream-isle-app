/**
 * 续播/兜底已看判定纯函数（M2 文档 §4.9；设计文档 §7.3；M6 文档 §4.7 入参放宽）。
 * M6：入参放宽为结构子集 ResumeSource——MediaDetail（经 toResumeSource 适配）与
 * 下载快照行均满足，离线续播弹窗复用同一判定。
 */
import { RESUME_MIN_POSITION_MS, WATCHED_COMPLETION_RATIO } from '@/constant/playback';

/** 播放会话结束原因（M2 文档 §4.5；PlaybackService.finish 消费） */
export type PlaybackEndReason = 'user_exit' | 'natural_end' | 'error';

/**
 * 断点/时长最小输入（getResumePositionMs 的结构依赖，06 文档 §4.7）：
 * played / playbackPositionMs / runtimeMs 三字段结构子集。
 */
export interface ResumeSource {
  played: boolean;
  playbackPositionMs: number;
  runtimeMs?: number;
}

/** M2 既有形态适配（MediaDetail/EpisodeItem 的 userData + runtimeMs → ResumeSource） */
export function toResumeSource(
  item: { userData: { played: boolean; playbackPositionMs: number }; runtimeMs?: number }
): ResumeSource {
  return {
    played: item.userData.played,
    playbackPositionMs: item.userData.playbackPositionMs,
    runtimeMs: item.runtimeMs,
  };
}

/**
 * 详情页/集卡片点播放/离线续播时算续播起点：返回 null 表示从头播且不弹窗。
 * 规则（02 §4.9，06 §4.7 真值表不变）：
 * - 已看完（played === true）→ null；
 * - 断点 > RESUME_MIN_POSITION_MS（10s）且 < runtimeMs × WATCHED_COMPLETION_RATIO（95%）→ 断点；
 * - 其余（≤10s、无时长、≥95%）→ null。
 */
export function getResumePositionMs(source: ResumeSource): number | null {
  const positionMs = source.playbackPositionMs;
  if (source.played) {
    return null;
  }
  if (positionMs <= RESUME_MIN_POSITION_MS) {
    return null;
  }
  if (source.runtimeMs === undefined || source.runtimeMs <= 0) {
    return null;
  }
  if (positionMs >= source.runtimeMs * WATCHED_COMPLETION_RATIO) {
    return null;
  }
  return positionMs;
}

/**
 * Stopped 兜底标记已看判定（PlaybackService.finish 内调用）。
 * 规则（02 §4.9）：natural_end 必标记（服务器判定 + 客户端兜底双保险，不依赖 runtimeMs 是否存在）；
 * 其余 reason：runtimeMs 有效且 > 0 且 positionMs/runtimeMs ≥ 95% → 标记；否则 false。
 */
export function shouldForceMarkPlayed(
  positionMs: number,
  runtimeMs: number | undefined,
  reason: PlaybackEndReason
): boolean {
  if (reason === 'natural_end') {
    return true;
  }
  if (runtimeMs === undefined || runtimeMs <= 0) {
    return false;
  }
  return positionMs / runtimeMs >= WATCHED_COMPLETION_RATIO;
}
