/**
 * 主题 token 单测（M6 文档 §6.1 theme 行）：resolveTokens 三态
 * （system × 双系统方案、light、dark）。
 */
import {
  ACCENT_SCHEMES,
  ACCENT_SCHEME_LIST,
  DARK_TOKENS,
  LIGHT_TOKENS,
  resolveTokens,
} from '@/constant/theme';
import { translateFor } from '@/i18n/translate';

describe('resolveTokens 三态（M6 §6.1 theme 行）', () => {
  it('system + dark → DARK_TOKENS；system + light → LIGHT_TOKENS', () => {
    expect(resolveTokens('system', 'dark')).toBe(DARK_TOKENS);
    expect(resolveTokens('system', 'light')).toBe(LIGHT_TOKENS);
  });

  it('light / dark 显式模式不随系统方案', () => {
    expect(resolveTokens('light', 'dark')).toBe(LIGHT_TOKENS);
    expect(resolveTokens('dark', 'light')).toBe(DARK_TOKENS);
  });

  it('两套 token 结构一致（浅色按深色逐项反推，无缺键）', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DARK_TOKENS).sort());
  });

  it('亮色优先：浅色 bg 为浅底且正文有对比；深色保持深底', () => {
    expect(DARK_TOKENS.bg).toBe('#0A1418');
    expect(LIGHT_TOKENS.bg).toBe('#F5F7F8');
    expect(LIGHT_TOKENS.textPrimary).not.toBe(LIGHT_TOKENS.bg);
    expect(LIGHT_TOKENS.textSecondary).not.toBe(LIGHT_TOKENS.bg);
  });

  it('配色方案只覆盖强调色三件套，绿色只保留翡翠', () => {
    const blue = resolveTokens('light', 'dark', 'BLUE');
    expect(blue.accent).toBe(ACCENT_SCHEMES.BLUE.light.accent);
    expect(blue.accentOn).toBe(ACCENT_SCHEMES.BLUE.light.accentOn);
    expect(blue.accentSoft).toBe(ACCENT_SCHEMES.BLUE.light.accentSoft);
    expect(blue.bg).toBe(LIGHT_TOKENS.bg);
    expect(blue.surface).toBe(LIGHT_TOKENS.surface);

    const labels = ACCENT_SCHEME_LIST.map((scheme) => translateFor('zh', scheme.labelKey));
    expect(labels).toContain('翡翠');
    expect(labels).not.toContain('翠玉');
    expect(labels).not.toContain('翠绿');
  });

  it('深色主题使用同一方案的暗色主色', () => {
    expect(resolveTokens('dark', 'light', 'BERRY').accent).toBe(
      ACCENT_SCHEMES.BERRY.dark.accent
    );
    expect(resolveTokens('system', 'dark', 'CARAMEL').accent).toBe(
      ACCENT_SCHEMES.CARAMEL.dark.accent
    );
  });
});
