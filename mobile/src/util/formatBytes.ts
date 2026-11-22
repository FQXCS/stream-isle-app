/**
 * 字节格式化（M6 文档 §4.4.5 下载页「大小/占用」展示；util/format 归 M2 时长口径，
 * 字节量级独立小函数就近放置——禁魔法数字：单位进位 1024 收敛本文件唯一出处）。
 */

/** 单位序列（B → TB；formatBytes 顺序消费） */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** 字节数 → 可读文本（1024 进位；<1024B 直显整数，其余保留 1 位小数） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${Math.round(value)} ${BYTE_UNITS[unitIndex]}`;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}
