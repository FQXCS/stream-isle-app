/**
 * adapter 媒体管理端点单测：getUserViews includeHidden 参数、
 * getUserConfiguration GET /Users/{uid} 解析 Configuration、
 * updateUserConfiguration POST 全量回写 + 认证头（双 flavor 各实例化验证一次）。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown = {}
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok-1' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('adapter 媒体管理（Views includeHidden / UserConfiguration 读写）', () => {
  it('getUserViews 默认不带 includeHidden；true 时追加 query', async () => {
    const { adapter, api } = makeAdapter('EMBY', { Items: [] });
    await adapter.getUserViews('u1');
    expect(api.request.mock.calls[0][0].url).toBe('http://srv/Users/u1/Views');
    await adapter.getUserViews('u1', true);
    expect(api.request.mock.calls[1][0].url).toBe('http://srv/Users/u1/Views?includeHidden=true');
  });

  it('getUserConfiguration：GET /Users/{uid} 解析 Configuration（双 flavor）', async () => {
    for (const flavor of ['EMBY', 'JELLYFIN'] as const) {
      const { adapter, api } = makeAdapter(flavor, {
        Configuration: { OrderedViews: ['v2', 'v1'], MyMediaExcludes: ['v3'] },
      });
      const config = await adapter.getUserConfiguration('u1');
      expect(api.request.mock.calls[0][0]).toMatchObject({
        method: 'GET',
        url: 'http://srv/Users/u1',
      });
      expect(config.OrderedViews).toEqual(['v2', 'v1']);
      expect(config.MyMediaExcludes).toEqual(['v3']);
    }
  });

  it('getUserConfiguration：响应无 Configuration 时按空对象处理', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {});
    await expect(adapter.getUserConfiguration('u1')).resolves.toEqual({});
  });

  it('updateUserConfiguration：POST 全量 body + 认证头（双 flavor）', async () => {
    const config = { OrderedViews: ['v1'], MyMediaExcludes: [], PlayDefaultAudioTrack: true };
    for (const flavor of ['EMBY', 'JELLYFIN'] as const) {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.updateUserConfiguration('u1', config);
      const req = api.request.mock.calls[0][0];
      expect(req).toMatchObject({
        method: 'POST',
        url: 'http://srv/Users/u1/Configuration',
        body: config,
      });
      const headers = req.headers as Record<string, string>;
      if (flavor === 'EMBY') {
        expect(headers['X-Emby-Token']).toBe('tok-1');
      } else {
        expect(headers.Authorization).toContain('Token="tok-1"');
      }
    }
  });
});