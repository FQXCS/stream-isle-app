/** 纯翻译：插值、缺参保留占位、英文单复数、语言差异。 */
import { translateFor } from '@/i18n/translate';

describe('translateFor', () => {
  it('字符串消息按 {name} 插值', () => {
    expect(translateFor('zh', 'server.cardStats', { movies: 3, series: 5 })).toBe(
      '电影: 3 剧集: 5'
    );
    expect(translateFor('en', 'server.cardStats', { movies: 3, series: 5 })).toBe(
      'Movies: 3 · Series: 5'
    );
  });

  it('缺失参数保留占位符', () => {
    expect(translateFor('zh', 'server.cardStats', { movies: 1 })).toBe('电影: 1 剧集: {series}');
  });

  it('英文单复数函数消息', () => {
    expect(translateFor('en', 'format.minutesAgo', { count: 1 })).toBe('1 minute ago');
    expect(translateFor('en', 'format.minutesAgo', { count: 0 })).toBe('0 minutes ago');
    expect(translateFor('en', 'format.minutesAgo', { count: 2 })).toBe('2 minutes ago');
    expect(translateFor('en', 'server.itemCount', { count: 1 })).toBe('1 item');
    expect(translateFor('en', 'server.itemCount', { count: 3 })).toBe('3 items');
  });

  it('显式语言覆盖：同一 key 中英不同', () => {
    expect(translateFor('zh', 'error.NETWORK_UNREACHABLE')).toContain('无法连接服务器');
    expect(translateFor('en', 'error.NETWORK_UNREACHABLE')).toContain('Cannot reach the server');
  });
});
