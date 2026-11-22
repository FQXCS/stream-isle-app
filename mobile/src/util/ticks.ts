/**
 * 时间换算（M1 文档 §4.4）：共享契约——时间统一 Ticks(100ns) ↔ 毫秒。
 * 服务器字段（PlaybackPositionTicks/RunTimeTicks）在 adapter 内换算，UI 层只见毫秒。
 */

/** Ticks(100ns) → 毫秒 */
export function ticksToMs(ticks: number): number {
  return Math.round(ticks / 10000);
}

/** 毫秒 → Ticks(100ns) */
export function msToTicks(ms: number): number {
  return Math.round(ms) * 10000;
}
