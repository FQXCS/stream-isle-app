/**
 * imageUrl 差异单测（M1 文档 §6.1 imageUrl 行）：Emby 无 tag、Jellyfin 带 tag；
 * maxWidth=400&quality=85；URL 含 api_key。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import { IMAGE_QUALITY, POSTER_MAX_WIDTH } from '@/constant/image';

function make(flavor: 'JELLYFIN' | 'EMBY', token?: string): JellyfinAdapter | EmbyAdapter {
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  return new Ctor({ baseUrl: 'http://srv', flavor, token });
}

describe('imageUrl（§4.6.3 拼 URL 契约）', () => {
  it('URL 结构：{base}/Items/{id}/Images/{type}（type 与 URL 段同形直拼）', () => {
    const url = make('EMBY', 'tk').imageUrl('itm1', 'Backdrop', POSTER_MAX_WIDTH);
    expect(url).toBe(`http://srv/Items/itm1/Images/Backdrop?maxWidth=400&quality=${IMAGE_QUALITY}&api_key=tk`);
  });

  it('maxWidth=400&quality=85（POSTER_MAX_WIDTH/IMAGE_QUALITY）', () => {
    const url = make('EMBY').imageUrl('itm1', 'Primary', POSTER_MAX_WIDTH);
    expect(url).toContain('maxWidth=400');
    expect(url).toContain('quality=85');
  });

  it('Emby 无 tag 参数（imageTagQuery 返回空）', () => {
    const url = make('EMBY', 'tk').imageUrl('itm1', 'Primary', POSTER_MAX_WIDTH);
    expect(url).not.toContain('tag=');
    expect(url).toContain('api_key=tk');
  });

  it('无 token 时不含 api_key', () => {
    const url = make('JELLYFIN').imageUrl('itm1', 'Primary', POSTER_MAX_WIDTH);
    expect(url).not.toContain('api_key=');
  });

  // M5（05 文档 §4.3/§6.1）：maxWidth 缺省 → 原图（不带尺寸/质量参数）
  it('maxWidth 缺省时不带尺寸/质量参数（原图 URL，「查看原图」与保存用）', () => {
    const url = make('EMBY', 'tk').imageUrl('itm1', 'Primary');
    expect(url).toBe('http://srv/Items/itm1/Images/Primary?api_key=tk');
    expect(url).not.toContain('maxWidth=');
    expect(url).not.toContain('quality=');
  });

  it('maxWidth 缺省时带值口径与 M1 一致（回归）', () => {
    const url = make('EMBY', 'tk').imageUrl('itm1', 'Primary', 400);
    expect(url).toContain('maxWidth=400');
    expect(url).toContain('quality=85');
  });
});
