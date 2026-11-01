/**
 * 时长格式化（M2 文档 §4.1：M1 缺失，M2 第 1 步补齐）。
 * 播放器时长/剩余时长、seek 预览气泡、续播弹窗文案共用。
 * M3 增量：音轨声道数展示（AudioTrackMenu，03 §4.8.1）。
 */

/**
 * 毫秒 → 时钟文本：不足 1 小时为 "mm:ss"，超过为 "h:mm:ss"。
 * 负数按 0 处理（剩余时长在调用方加 "-" 前缀）。
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsText = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}`;
  }
  return `${minutes}:${secondsText}`;
}

/**
 * 毫秒 → 中文时长（M8 详情页元数据「26分钟」口径）：
 * 不足 1 小时为 "N分钟"，超过为 "N小时" / "N小时M分钟"；负数按 0 处理。
 */
export function formatRuntime(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }
  return `${minutes}分钟`;
}

/**
 * 音轨声道数 → 展示文本（M3 文档 §4.8.1 AudioTrackMenu）：6→"5.1"、8→"7.1"、其余数字直显
 * （2→"2"；undefined → undefined 不展示）。
 */
export function formatChannels(channels: number | undefined): string | undefined {
  if (channels === undefined) {
    return undefined;
  }
  if (channels === 6) {
    return '5.1';
  }
  if (channels === 8) {
    return '7.1';
  }
  return String(channels);
}

/**
 * 毫秒时间戳 → "YYYY-MM-DD"（M5 文档 §4.1 增量：照片查看器信息条「拍摄日期」）。
 * 无效值（NaN/负数等无法构造日期）回退空串，调用方按缺省不展示处理。
 */
export function formatDate(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
