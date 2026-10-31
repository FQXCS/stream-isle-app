/**
 * Ticks 换算单测（M1 文档 §6.1 ticks 行）。
 * 注：文档示例 `ticksToMs(5_0000_0000)=500_000（500s）` 的字面量笔误（5e8/10000=5e4ms=50s），
 * 按 Ticks=100ns 的标准换算式（÷10000）断言 500s 对应 5e9 ticks。
 */
import { msToTicks, ticksToMs } from '@/util/ticks';

describe('ticks ↔ ms 换算（Ticks = 100ns）', () => {
  it('ticksToMs(5_000_000_000) = 500_000（500 秒）', () => {
    expect(ticksToMs(5_000_000_000)).toBe(500_000);
  });

  it('msToTicks 往返一致', () => {
    const ms = 500_000;
    expect(ticksToMs(msToTicks(ms))).toBe(ms);
  });

  it('大时长（10 小时）不溢出（Number 精度内）', () => {
    const tenHoursMs = 10 * 60 * 60 * 1000;
    expect(ticksToMs(msToTicks(tenHoursMs))).toBe(tenHoursMs);
    expect(msToTicks(tenHoursMs)).toBe(360_000_000_000);
  });

  it('0 与负数边界', () => {
    expect(ticksToMs(0)).toBe(0);
    expect(msToTicks(0)).toBe(0);
    expect(ticksToMs(msToTicks(-1500))).toBe(-1500);
  });
});
