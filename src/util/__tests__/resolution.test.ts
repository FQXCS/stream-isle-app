/**
 * 蜂窝自动降分辨率判定真值表 + 菜单档位收敛：
 * cellular+开关开→480p（用户更严格档保持）、cellular+开关关→userTier、wifi→userTier、
 * none→null（断网不动作）、未知 type→userTier；高于源分辨率的档隐藏/归一为原画。
 */
import {
  availableResolutionTiers,
  normalizeResolutionTierForSource,
  resolveResolutionTierForNetwork,
} from '@/util/resolution';

describe('resolveResolutionTierForNetwork（真值表）', () => {
  it('cellular + 开关开 → 480p', () => {
    expect(resolveResolutionTierForNetwork('UNLIMITED', 'cellular', true)).toBe('SD');
    expect(resolveResolutionTierForNetwork('UHD', 'cellular', true)).toBe('SD');
    expect(resolveResolutionTierForNetwork('FHD', 'cellular', true)).toBe('SD');
    expect(resolveResolutionTierForNetwork('HD', 'cellular', true)).toBe('SD');
  });

  it('cellular + 开关开 + 用户档同为 480p → 保持 480p', () => {
    expect(resolveResolutionTierForNetwork('SD', 'cellular', true)).toBe('SD');
  });

  it('cellular + 开关关 → userTier（不降档）', () => {
    expect(resolveResolutionTierForNetwork('UNLIMITED', 'cellular', false)).toBe('UNLIMITED');
    expect(resolveResolutionTierForNetwork('FHD', 'cellular', false)).toBe('FHD');
  });

  it('wifi → userTier（含恢复方向：回 WiFi 恢复用户档位）', () => {
    expect(resolveResolutionTierForNetwork('UNLIMITED', 'wifi', true)).toBe('UNLIMITED');
    expect(resolveResolutionTierForNetwork('FHD', 'wifi', false)).toBe('FHD');
  });

  it('none → null（断网过渡态不触发任何会话动作）', () => {
    expect(resolveResolutionTierForNetwork('UNLIMITED', 'none', true)).toBeNull();
    expect(resolveResolutionTierForNetwork('HD', 'none', false)).toBeNull();
  });

  it('未知 type → userTier', () => {
    expect(resolveResolutionTierForNetwork('UNLIMITED', 'ethernet', true)).toBe('UNLIMITED');
    expect(resolveResolutionTierForNetwork('HD', 'vpn', true)).toBe('HD');
  });
});

describe('菜单档位按源分辨率收敛', () => {
  it('720p 源：隐藏 4K/1080p，保留原画/720p/480p', () => {
    expect(availableResolutionTiers(720).map((tier) => tier.label)).toEqual([
      '原画',
      '720p',
      '480p',
    ]);
  });

  it('1080p 源：隐藏 4K，保留原画/1080p/720p/480p', () => {
    expect(availableResolutionTiers(1080).map((tier) => tier.label)).toEqual([
      '原画',
      '1080p',
      '720p',
      '480p',
    ]);
  });

  it('源尺寸未知 → 展示全部档位', () => {
    expect(availableResolutionTiers()).toHaveLength(5);
    expect(availableResolutionTiers(0)).toHaveLength(5);
  });

  it('当前档高于源 → 归一为原画（不会放大）', () => {
    expect(normalizeResolutionTierForSource('FHD', 720)).toBe('UNLIMITED');
    expect(normalizeResolutionTierForSource('UHD', 1080)).toBe('UNLIMITED');
    expect(normalizeResolutionTierForSource('HD', 720)).toBe('HD');
    expect(normalizeResolutionTierForSource('SD', 720)).toBe('SD');
    expect(normalizeResolutionTierForSource('UNLIMITED', 720)).toBe('UNLIMITED');
    expect(normalizeResolutionTierForSource('FHD')).toBe('FHD');
  });
});
