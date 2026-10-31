/**
 * 主题 token 单测（06 文档 §6.1 theme 行）：resolveTokens 三态
 * （system × 双系统方案、light、dark）。
 */
import {
  DARK_TOKENS,
  LIGHT_TOKENS,
  resolveTokens,
} from '@/constant/theme';

describe('resolveTokens 三态（06 §6.1 theme 行）', () => {
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

  it('深色为默认基调：bg 为深色底；浅色正文对浅背景有对比（非白底白字）', () => {
    expect(DARK_TOKENS.bg).toBe('#0B0F14');
    expect(LIGHT_TOKENS.textPrimary).not.toBe(LIGHT_TOKENS.bg);
    expect(LIGHT_TOKENS.textSecondary).not.toBe(LIGHT_TOKENS.bg);
  });
});
