import { abLoopSeekTarget, advanceAbLoop } from '@/util/abLoop';

describe('advanceAbLoop 三态推进', () => {
  it('未设区间时首次点击设 A 点', () => {
    expect(advanceAbLoop(null, 5000)).toEqual({ aMs: 5000, bMs: null });
  });

  it('仅 A 点时二次点击设 B 点', () => {
    expect(advanceAbLoop({ aMs: 5000, bMs: null }, 9000)).toEqual({ aMs: 5000, bMs: 9000 });
  });

  it('二次点击位置未过 A 点时重置 A（避免倒区间）', () => {
    expect(advanceAbLoop({ aMs: 5000, bMs: null }, 3000)).toEqual({ aMs: 3000, bMs: null });
    expect(advanceAbLoop({ aMs: 5000, bMs: null }, 5000)).toEqual({ aMs: 5000, bMs: null });
  });

  it('完整区间时三次点击清除', () => {
    expect(advanceAbLoop({ aMs: 5000, bMs: 9000 }, 7000)).toBeNull();
  });
});

describe('abLoopSeekTarget 越 B 回 A', () => {
  it('无区间或仅 A 点时不 seek', () => {
    expect(abLoopSeekTarget(null, 9000)).toBeNull();
    expect(abLoopSeekTarget({ aMs: 5000, bMs: null }, 9000)).toBeNull();
  });

  it('未到 B 点不 seek', () => {
    expect(abLoopSeekTarget({ aMs: 5000, bMs: 9000 }, 8999)).toBeNull();
  });

  it('到达/越过 B 点回 A', () => {
    expect(abLoopSeekTarget({ aMs: 5000, bMs: 9000 }, 9000)).toBe(5000);
    expect(abLoopSeekTarget({ aMs: 5000, bMs: 9000 }, 9500)).toBe(5000);
  });
});