/**
 * formatClock 单测（M2 文档 §6.1：时长格式化；播放器时长/剩余/气泡共用）。
 * M5 增量：formatDate（照片查看器信息条「拍摄日期」，§6.1）。
 */
import { formatChannels, formatClock, formatDate } from '@/util/format';

describe('formatClock', () => {
  it('不足 1 小时：mm:ss，秒补零', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(20 * 60 * 1000)).toBe('20:00');
  });

  it('超过 1 小时：h:mm:ss（分/秒补零）', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
    expect(formatClock(28_800_000)).toBe('8:00:00');
  });

  it('负数与毫秒截断：按 0 / 向下取整处理', () => {
    expect(formatClock(-1_000)).toBe('0:00');
    expect(formatClock(1_999)).toBe('0:01');
  });
});

describe('formatChannels（M3 §6.1 format 增量：AudioTrackMenu 声道展示）', () => {
  it('6 → "5.1"、8 → "7.1"', () => {
    expect(formatChannels(6)).toBe('5.1');
    expect(formatChannels(8)).toBe('7.1');
  });

  it('其余数字直显（2 → "2"）', () => {
    expect(formatChannels(2)).toBe('2');
    expect(formatChannels(1)).toBe('1');
    expect(formatChannels(7)).toBe('7');
  });

  it('undefined → undefined（不展示）', () => {
    expect(formatChannels(undefined)).toBeUndefined();
  });
});

describe('formatDate（M5 §6.1：毫秒 → "YYYY-MM-DD"）', () => {
  it('毫秒时间戳 → YYYY-MM-DD（本地时区）', () => {
    // 用本地时区构造，避免 CI 与本机时区差异
    const date = new Date(2026, 0, 2, 3, 4, 5);
    expect(formatDate(date.getTime())).toBe('2026-01-02');
  });

  it('月/日补零', () => {
    const date = new Date(2026, 10, 5);
    expect(formatDate(date.getTime())).toBe('2026-11-05');
  });

  it('无效值（NaN）回退空串', () => {
    expect(formatDate(Number.NaN)).toBe('');
  });
});
