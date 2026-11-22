/**
 * 歌词定位纯函数（M6 文档 §4.6.3；设计文档 §7.5 歌词 P1）：
 * 当前应高亮的歌词行下标。有序 startMs 的最后一条 ≤ positionMs；
 * 纯文本（无 startMs）或无匹配返回 -1。NowPlaying 歌词面板逐行高亮/滚动唯一判定来源。
 */
import type { LyricLine } from '@/adapter/model';

/**
 * 当前应高亮的歌词行下标：
 * - 空表 → -1；
 * - 首行 startMs 已 > positionMs（未进第一句）→ -1；
 * - 其余取「最后一条 startMs ≤ positionMs」的行；position 超尾时停留最后一行。
 * 混入的纯文本行（无 startMs）不参与命中（保持 -1 或前一条时间行），不做猜测插值。
 */
export function activeLyricIndex(lines: LyricLine[], positionMs: number): number {
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const startMs = lines[index]?.startMs;
    if (startMs === undefined || startMs > positionMs) {
      break;
    }
    active = index;
  }
  return active;
}
