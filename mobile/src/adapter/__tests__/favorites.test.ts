/**
 * adapter 收藏成对端点单测（M4 文档 §6.1 adapter 收藏行）：
 * markFavorite/unmarkFavorite 的 URL、HTTP 方法（POST/DELETE）、认证头注入正确
 * （双 flavor 各实例化验证一次）；markPlayed/unmarkPlayed 既有用例不回退。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  requestImpl?: () => Promise<unknown>
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = {
    request: requestImpl ? jest.fn(requestImpl) : jest.fn().mockResolvedValue(undefined),
  };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok-1' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('adapter 收藏（POST/DELETE /Users/{uid}/FavoriteItems/{itemId}，M4 §4.4）', () => {
  it('Jellyfin 实例：markFavorite POST / unmarkFavorite DELETE，Authorization 头带 token', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN');
    await adapter.markFavorite('u1', 'item1');
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: 'http://srv/Users/u1/FavoriteItems/item1',
    });
    await adapter.unmarkFavorite('u1', 'item1');
    expect(api.request.mock.calls[1][0]).toMatchObject({
      method: 'DELETE',
      url: 'http://srv/Users/u1/FavoriteItems/item1',
    });
    // 认证头注入（Jellyfin：Token 拼入标准 Authorization 设备头）
    const headers = api.request.mock.calls[0][0].headers as Record<string, string>;
    expect(headers.Authorization).toContain('Token="tok-1"');
    expect(headers.Authorization).toContain('MediaBrowser Client=');
  });

  it('Emby 实例：URL 与方法一致，X-Emby-Token 独立头注入', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.markFavorite('u2', 'item2');
    await adapter.unmarkFavorite('u2', 'item2');
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: 'http://srv/Users/u2/FavoriteItems/item2',
    });
    expect(api.request.mock.calls[1][0]).toMatchObject({
      method: 'DELETE',
      url: 'http://srv/Users/u2/FavoriteItems/item2',
    });
    // 认证头注入（Emby：X-Emby-Authorization 设备头 + X-Emby-Token 独立头）
    const headers = api.request.mock.calls[0][0].headers as Record<string, string>;
    expect(headers['X-Emby-Authorization']).toContain('MediaBrowser Client=');
    expect(headers['X-Emby-Token']).toBe('tok-1');
  });

  it('getItemFavorite：GET Items/{id}?Fields=UserData 并解析 IsFavorite', async () => {
    const { adapter, api } = makeAdapter('EMBY', async () => ({
      UserData: { IsFavorite: true },
    }));
    await expect(adapter.getItemFavorite('u1', 'item1')).resolves.toBe(true);
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      url: 'http://srv/Users/u1/Items/item1?Fields=UserData',
    });
  });

  it('getItemFavorite：响应无 UserData 时按未收藏处理', async () => {
    const { adapter } = makeAdapter('JELLYFIN', async () => ({}));
    await expect(adapter.getItemFavorite('u1', 'item1')).resolves.toBe(false);
  });

  it('markPlayed/unmarkPlayed 既有成对签名不回退（POST/DELETE PlayedItems）', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN');
    await adapter.markPlayed('u1', 'ep1');
    await adapter.unmarkPlayed('u1', 'ep1');
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: 'http://srv/Users/u1/PlayedItems/ep1',
    });
    expect(api.request.mock.calls[1][0]).toMatchObject({
      method: 'DELETE',
      url: 'http://srv/Users/u1/PlayedItems/ep1',
    });
  });
});
