/**
 * util/lyrics 单测（M6 文档 §6.1 util/lyrics 行）：activeLyricIndex 真值表
 * （空表、未同步、命中首/中/末行、position 超尾、混入纯文本行）。
 */
import type { LyricLine } from '@/adapter/model';
import { activeLyricIndex } from '@/util/lyrics';

/** 构造同步歌词行 */
function line(text: string, startMs?: number): LyricLine {
  return startMs === undefined ? { text } : { text, startMs };
}

const SYNCED: LyricLine[] = [
  line('第一句', 0),
  line('第二句', 10_000),
  line('第三句', 25_000),
  line('第四句', 40_000),
];

describe('activeLyricIndex 真值表（M6 §6.1）', () => {
  it('空表 → -1', () => {
    expect(activeLyricIndex([], 10_000)).toBe(-1);
  });

  it('纯文本歌词（无任何 startMs）→ -1', () => {
    expect(activeLyricIndex([line('a'), line('b')], 10_000)).toBe(-1);
  });

  it('未进第一句（首行 startMs > position）→ -1', () => {
    const lines = [line('第一句', 5_000), line('第二句', 10_000)];
    expect(activeLyricIndex(lines, 4_999)).toBe(-1);
  });

  it('命中首行/中行（最后一条 ≤ position）', () => {
    expect(activeLyricIndex(SYNCED, 0)).toBe(0);
    expect(activeLyricIndex(SYNCED, 9_999)).toBe(0);
    expect(activeLyricIndex(SYNCED, 10_000)).toBe(1);
    expect(activeLyricIndex(SYNCED, 30_000)).toBe(2);
  });

  it('position 超尾 → 停留最后一行', () => {
    expect(activeLyricIndex(SYNCED, 999_999)).toBe(3);
  });

  it('混入纯文本行：保守截断——推进止于最后一条时间行（纯文本行不参与命中）', () => {
    const lines = [line('时间行', 1_000), line('纯文本行')];
    expect(activeLyricIndex(lines, 2_000)).toBe(0);
  });
});
