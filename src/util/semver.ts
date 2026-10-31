/**
 * 语义化版本比较（M1 文档 §4.4；设计文档 §5.1：Jellyfin<10.8 / Emby<4.7 警告）。
 */

/**
 * 逐段数值比较版本号，段数不齐补 0。
 *
 * @returns a > b 返回正数；a < b 返回负数；相等返回 0
 */
export function compareVersion(a: string, b: string): number {
  const partsA = a.split('.');
  const partsB = b.split('.');
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    // 段数不齐补 0；非数字段按 0 处理（防御脏数据，不抛错）
    const segA = Number.parseInt(partsA[i] ?? '0', 10) || 0;
    const segB = Number.parseInt(partsB[i] ?? '0', 10) || 0;
    if (segA !== segB) {
      return segA - segB;
    }
  }
  return 0;
}
