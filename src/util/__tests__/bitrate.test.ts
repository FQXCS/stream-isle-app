/**
 * 蜂窝自动降档判定真值表（M3 文档 §6.1 util/bitrate 行）：
 * cellular+开关开→MEDIUM、cellular+开关关→userTier、wifi→userTier、none→null（断网不动作）、
 * 未知 type→userTier。
 */
import { resolveBitrateTierForNetwork } from '@/util/bitrate';

describe('resolveBitrateTierForNetwork（真值表）', () => {
  it('cellular + 开关开 → MEDIUM（4Mbps）', () => {
    expect(resolveBitrateTierForNetwork('AUTO', 'cellular', true)).toBe('MEDIUM');
    expect(resolveBitrateTierForNetwork('HIGH', 'cellular', true)).toBe('MEDIUM');
  });

  it('cellular + 开关关 → userTier（不降档）', () => {
    expect(resolveBitrateTierForNetwork('AUTO', 'cellular', false)).toBe('AUTO');
    expect(resolveBitrateTierForNetwork('LOW', 'cellular', false)).toBe('LOW');
  });

  it('wifi → userTier（含恢复方向：回 WiFi 恢复用户档位）', () => {
    expect(resolveBitrateTierForNetwork('AUTO', 'wifi', true)).toBe('AUTO');
    expect(resolveBitrateTierForNetwork('HIGH', 'wifi', false)).toBe('HIGH');
  });

  it('none → null（断网过渡态不触发任何会话动作）', () => {
    expect(resolveBitrateTierForNetwork('AUTO', 'none', true)).toBeNull();
    expect(resolveBitrateTierForNetwork('LOW', 'none', false)).toBeNull();
  });

  it('未知 type → userTier', () => {
    expect(resolveBitrateTierForNetwork('AUTO', 'ethernet', true)).toBe('AUTO');
    expect(resolveBitrateTierForNetwork('MEDIUM', 'vpn', true)).toBe('MEDIUM');
  });
});
