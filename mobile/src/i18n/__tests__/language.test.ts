/** 语言偏好解析：显式偏好优先；跟随系统仅 zh* 落中文。 */
import { resolveLanguage, resetSystemLanguageCache } from '@/i18n/language';

describe('resolveLanguage', () => {
  afterEach(() => {
    resetSystemLanguageCache();
  });

  it('显式 zh/en 覆盖系统语言', () => {
    expect(resolveLanguage('zh', 'en-US')).toBe('zh');
    expect(resolveLanguage('en', 'zh-CN')).toBe('en');
  });

  it('跟随系统：zh / zh-Hans-CN / ZH 均落中文', () => {
    expect(resolveLanguage('system', 'zh')).toBe('zh');
    expect(resolveLanguage('system', 'zh-Hans-CN')).toBe('zh');
    expect(resolveLanguage('system', 'ZH')).toBe('zh');
  });

  it('跟随系统：非中文系统与未知语言落英文', () => {
    expect(resolveLanguage('system', 'en-US')).toBe('en');
    expect(resolveLanguage('system', 'ja-JP')).toBe('en');
    expect(resolveLanguage('system', null)).toBe('en');
    expect(resolveLanguage('system', '')).toBe('en');
  });
});
