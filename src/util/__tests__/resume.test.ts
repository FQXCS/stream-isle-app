/**
 * 续播/兜底判定真值表单测（M2 文档 §6.1 util/resume 行；§4.9 规则）。
 * M6（06 文档 §4.7/§6.1）：入参放宽为 ResumeSource 后，原真值表经 toResumeSource
 * 适配回归，断言值全部保持不变；新增下载快照行直接构造 ResumeSource 的离线续播用例。
 */
import type { UserItemData } from '@/adapter/model';
import {
  getResumePositionMs,
  shouldForceMarkPlayed,
  toResumeSource,
  type ResumeSource,
} from '@/util/resume';

/** 构造 UserItemData（只关心断点/已看两字段） */
function userData(overrides: Partial<UserItemData> = {}): UserItemData {
  return {
    played: false,
    playCount: 0,
    favorite: false,
    playbackPositionMs: 0,
    ...overrides,
  };
}

/** M2 MediaDetail/EpisodeItem 形态 → ResumeSource（经 toResumeSource 适配后断言） */
function sourceFrom(
  overrides: Partial<UserItemData> = {},
  runtimeMs?: number
): ResumeSource {
  return toResumeSource({ userData: userData(overrides), runtimeMs });
}

describe('getResumePositionMs 真值表（M6 入参放宽后回归不变）', () => {
  const runtimeMs = 120 * 60 * 1000; // 120 分钟

  it('≤10s 断点 → null（直接从头播，不弹窗）', () => {
    expect(getResumePositionMs(sourceFrom({ playbackPositionMs: 10_000 }, runtimeMs))).toBeNull();
    expect(getResumePositionMs(sourceFrom({ playbackPositionMs: 5_000 }, runtimeMs))).toBeNull();
  });

  it('已看完（played）→ null，即使断点在有效区间', () => {
    expect(
      getResumePositionMs(sourceFrom({ played: true, playbackPositionMs: 30 * 60 * 1000 }, runtimeMs))
    ).toBeNull();
  });

  it('≥95% 断点 → null（视为已完成）', () => {
    expect(
      getResumePositionMs(sourceFrom({ playbackPositionMs: runtimeMs * 0.95 }, runtimeMs))
    ).toBeNull();
  });

  it('无时长（runtimeMs 缺失或 ≤0）→ null', () => {
    expect(getResumePositionMs(sourceFrom({ playbackPositionMs: 30 * 60 * 1000 }))).toBeNull();
    expect(getResumePositionMs(sourceFrom({ playbackPositionMs: 30 * 60 * 1000 }, 0))).toBeNull();
  });

  it('正常断点（>10s 且 <95%）→ 返回断点毫秒值', () => {
    const positionMs = 50 * 60 * 1000; // 50 分钟 = 41.7%
    expect(getResumePositionMs(sourceFrom({ playbackPositionMs: positionMs }, runtimeMs))).toBe(positionMs);
  });

  it('边界：10s+1ms 可续播、恰为 95% 前一毫秒可续播', () => {
    expect(getResumePositionMs(sourceFrom({ playbackPositionMs: 10_001 }, runtimeMs))).toBe(10_001);
    expect(
      getResumePositionMs(sourceFrom({ playbackPositionMs: runtimeMs * 0.95 - 1 }, runtimeMs))
    ).toBe(Math.round(runtimeMs * 0.95) - 1);
  });

  it('M6 离线续播：下载快照行直接构造 ResumeSource（played → 不弹续播；断点 → 弹）', () => {
    // 下载快照行映射（DownloadService.buildLocalSession 同款）：user_played/user_position_ms/runtime_ms
    const snapshotSource: ResumeSource = {
      played: false,
      playbackPositionMs: 20 * 60 * 1000,
      runtimeMs,
    };
    expect(getResumePositionMs(snapshotSource)).toBe(20 * 60 * 1000);
    expect(getResumePositionMs({ ...snapshotSource, played: true })).toBeNull();
  });
});

describe('shouldForceMarkPlayed 边界', () => {
  it('natural_end 必标记：runtimeMs 缺失/为 0 也标记', () => {
    expect(shouldForceMarkPlayed(0, undefined, 'natural_end')).toBe(true);
    expect(shouldForceMarkPlayed(0, 0, 'natural_end')).toBe(true);
    expect(shouldForceMarkPlayed(1_000, 100_000, 'natural_end')).toBe(true);
  });

  it('user_exit：≥95% 标记，<95% 不标记', () => {
    expect(shouldForceMarkPlayed(96, 100, 'user_exit')).toBe(true);
    expect(shouldForceMarkPlayed(95, 100, 'user_exit')).toBe(true);
    expect(shouldForceMarkPlayed(94.9, 100, 'user_exit')).toBe(false);
  });

  it('error：同 user_exit 口径（≥95% 标记）', () => {
    expect(shouldForceMarkPlayed(96, 100, 'error')).toBe(true);
    expect(shouldForceMarkPlayed(50, 100, 'error')).toBe(false);
  });

  it('user_exit/error 且 runtimeMs 缺失或 ≤0 → 不标记', () => {
    expect(shouldForceMarkPlayed(100, undefined, 'user_exit')).toBe(false);
    expect(shouldForceMarkPlayed(100, 0, 'error')).toBe(false);
  });
});
