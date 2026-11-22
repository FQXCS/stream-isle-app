/**
 * 版本比较单测（M1 文档 §6.1 semver 行；设计文档 §5.1）。
 */
import { compareVersion } from '@/util/semver';

describe('compareVersion（逐段数值比较，段数不齐补 0）', () => {
  it('10.10.1 vs 10.8 → 大于（不触发版本警告）', () => {
    expect(compareVersion('10.10.1', '10.8')).toBeGreaterThan(0);
  });

  it('4.7 vs 4.7 → 0（不警告）', () => {
    expect(compareVersion('4.7', '4.7')).toBe(0);
  });

  it('段数不齐补零：10.8 vs 10.8.0 → 0', () => {
    expect(compareVersion('10.8', '10.8.0')).toBe(0);
  });

  it('低于门槛为负：10.7.9 vs 10.8 / 4.6.9 vs 4.7', () => {
    expect(compareVersion('10.7.9', '10.8')).toBeLessThan(0);
    expect(compareVersion('4.6.9', '4.7')).toBeLessThan(0);
  });

  it('数值比较而非字典序：10.9 vs 10.10 为负', () => {
    expect(compareVersion('10.9', '10.10')).toBeLessThan(0);
  });
});
