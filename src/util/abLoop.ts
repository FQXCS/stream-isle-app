/**
 * AB 循环纯逻辑：按钮三态推进（设 A → 设 B → 清除）与越 B 回 A 判定。
 * 播放页按钮调 advanceAbLoop，handleProgress 每帧调 abLoopSeekTarget。
 */

/** AB 区间（bMs=null 表示仅设了 A 点） */
export interface AbLoop {
  aMs: number;
  bMs: number | null;
}

/** 三态推进：未设→设 A；仅 A→设 B（位置未过 A 则重置 A）；完整区间→清除 */
export function advanceAbLoop(loop: AbLoop | null, positionMs: number): AbLoop | null {
  if (loop === null) {
    return { aMs: positionMs, bMs: null };
  }
  if (loop.bMs === null) {
    return positionMs > loop.aMs
      ? { aMs: loop.aMs, bMs: positionMs }
      : { aMs: positionMs, bMs: null };
  }
  return null;
}

/** 播放位置到达 B 点时返回 A 点（回跳目标）；其余返回 null（无需 seek） */
export function abLoopSeekTarget(loop: AbLoop | null, positionMs: number): number | null {
  if (loop === null || loop.bMs === null || positionMs < loop.bMs) {
    return null;
  }
  return loop.aMs;
}