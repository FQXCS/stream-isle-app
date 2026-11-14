/**
 * 时长格式化（M2 文档 §4.1：M1 缺失，M2 第 1 步补齐）。
 * 播放器时长/剩余时长、seek 预览气泡、续播弹窗文案共用。
 * M3 增量：音轨声道数展示（AudioTrackMenu，M3 §4.8.1）。
 * 时长/相对时间按当前语言输出（format.* 文案），时钟与日期保持数字格式不本地化。
 */
import { t } from '@/i18n';

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
 * 毫秒 → 本地化时长（M8 详情页元数据「26分钟」口径）：
 * 不足 1 小时为「N分钟」，超过为「N小时」/「N小时M分钟」；负数按 0 处理。
 */
export function formatRuntime(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0
      ? t('format.runtimeHoursMinutes', { hours, minutes })
      : t('format.runtimeHours', { hours });
  }
  return t('format.runtimeMinutes', { minutes });
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
 * 毫秒时间戳 → 本地化相对时间（影视服务器卡片「1天前」口径）：
 * 1 分钟内「刚刚」、1 小时内「N分钟前」、24 小时内「N小时前」、30 天内「N天前」，
 * 更早回退 YYYY-MM-DD；无效值返回空串（调用方不展示）。
 */
export function formatRelativeTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) {
    return '';
  }
  const diff = Date.now() - ms;
  if (diff < 60_000) {
    return t('format.justNow');
  }
  if (diff < 3_600_000) {
    return t('format.minutesAgo', { count: Math.floor(diff / 60_000) });
  }
  if (diff < 86_400_000) {
    return t('format.hoursAgo', { count: Math.floor(diff / 3_600_000) });
  }
  if (diff < 30 * 86_400_000) {
    return t('format.daysAgo', { count: Math.floor(diff / 86_400_000) });
  }
  return formatDate(ms);
}

/**
 * 毫秒时间戳 → "YYYY-MM-DD"（M5 文档 §4.1 增量：照片查看器信息条「添加日期」）。
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

/**
 * 倍速标签（控制层按钮/倍速菜单共用）：整速保留一位小数（1 → 1.0X），
 * 非整速保留原精度（0.75 → 0.75X），避免 toFixed  rounding 失真。
 */
export function formatPlaybackSpeed(speed: number): string {
  return `${Number.isInteger(speed) ? speed.toFixed(1) : String(speed)}X`;
}
