/**
 * 字幕语言归一化单测（M4 文档 §6.1 normalizeSubtitleLang 行）：
 * 别名归一（zh/Chinese/zho → chi）与未命中透传。
 */
import { normalizeSubtitleLang } from '@/util/lang';

describe('normalizeSubtitleLang（M4 §4.5 匹配定稿）', () => {
  it('别名归一：zh/zho/chinese → chi', () => {
    expect(normalizeSubtitleLang('zh')).toBe('chi');
    expect(normalizeSubtitleLang('zho')).toBe('chi');
    expect(normalizeSubtitleLang('Chinese')).toBe('chi');
    expect(normalizeSubtitleLang('CHINESE')).toBe('chi');
  });

  it('别名归一：en/english → eng、ja/japanese → jpn、ko/korean → kor', () => {
    expect(normalizeSubtitleLang('en')).toBe('eng');
    expect(normalizeSubtitleLang('English')).toBe('eng');
    expect(normalizeSubtitleLang('ja')).toBe('jpn');
    expect(normalizeSubtitleLang('japanese')).toBe('jpn');
    expect(normalizeSubtitleLang('ko')).toBe('kor');
    expect(normalizeSubtitleLang('Korean')).toBe('kor');
  });

  it('三字码原样透传（与偏好等值比较）', () => {
    expect(normalizeSubtitleLang('chi')).toBe('chi');
    expect(normalizeSubtitleLang('eng')).toBe('eng');
    expect(normalizeSubtitleLang('jpn')).toBe('jpn');
    expect(normalizeSubtitleLang('kor')).toBe('kor');
  });

  it('未命中别名表返回小写原值（不猜码）', () => {
    expect(normalizeSubtitleLang('fre')).toBe('fre');
    expect(normalizeSubtitleLang('FRA')).toBe('fra');
  });

  it('缺省/空返回 undefined', () => {
    expect(normalizeSubtitleLang(undefined)).toBeUndefined();
    expect(normalizeSubtitleLang('')).toBeUndefined();
  });
});
