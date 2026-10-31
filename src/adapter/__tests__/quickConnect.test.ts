/**
 * adapter Quick Connect 单测（06 文档 §6.1 BaseAdapter.quickConnect 行）：
 * Enabled/Initiate/Connect 路径与方法（POST Initiate 无 body、Connect query 带 secret、
 * AuthenticateWithQuickConnect body {Secret}）；401 → QUICK_CONNECT_DISABLED、404 →
 * QUICK_CONNECT_EXPIRED；AuthResult 翻译（AccessToken/User）双 Adapter 各断言一遍。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import { AppError } from '@/infra/error';
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

describe('BaseAdapter Quick Connect（06 §6.1）', () => {
  it('isQuickConnectEnabled：GET /QuickConnect/Enabled 免认证（设备头无 token）', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN', () => Promise.resolve(true));
    await expect(adapter.isQuickConnectEnabled()).resolves.toBe(true);
    const req = api.request.mock.calls[0][0];
    expect(req.method).toBe('GET');
    expect(req.url).toBe('http://srv/QuickConnect/Enabled');
    expect(req.headers.Authorization).not.toContain('Token=');
  });

  it('initiateQuickConnect：POST 无 body，翻译 Code/Secret/FriendlyName（双 Adapter）', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor, () =>
        Promise.resolve({ Code: '123456', Secret: 'sec-1', FriendlyName: '我的服务器' })
      );
      const session = await adapter.initiateQuickConnect();
      expect(session).toEqual({ code: '123456', secret: 'sec-1', friendlyName: '我的服务器' });
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('POST');
      expect(req.url).toBe('http://srv/QuickConnect/Initiate');
      expect(req.body).toBeUndefined();
    }
  });

  it('pollQuickConnect：GET Connect?secret=…，Authenticated 翻译', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN', () =>
      Promise.resolve({ Authenticated: true })
    );
    await expect(adapter.pollQuickConnect('sec-9')).resolves.toEqual({ authenticated: true });
    expect(api.request.mock.calls[0][0].url).toBe('http://srv/QuickConnect/Connect?secret=sec-9');
  });

  it('pollQuickConnect Authenticated=false → 未授权继续轮询（翻译 false）', async () => {
    const { adapter } = makeAdapter('EMBY', () => Promise.resolve({ Authenticated: false }));
    await expect(adapter.pollQuickConnect('sec-9')).resolves.toEqual({ authenticated: false });
  });

  it('Initiate 401 → QUICK_CONNECT_DISABLED', async () => {
    const { adapter } = makeAdapter('EMBY', () =>
      Promise.reject(new AppError('UNAUTHORIZED', { httpStatus: 401 }))
    );
    await expect(adapter.initiateQuickConnect()).rejects.toMatchObject({
      code: 'QUICK_CONNECT_DISABLED',
    });
  });

  it('pollQuickConnect 404 → QUICK_CONNECT_EXPIRED', async () => {
    const { adapter } = makeAdapter('JELLYFIN', () =>
      Promise.reject(new AppError('NOT_FOUND', { httpStatus: 404 }))
    );
    await expect(adapter.pollQuickConnect('expired')).rejects.toMatchObject({
      code: 'QUICK_CONNECT_EXPIRED',
    });
  });

  it('loginWithQuickConnect：POST body {Secret}，AuthResult 翻译（双 Adapter 均免认证头——授权前交换，与 login 同语义）', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor, () =>
        Promise.resolve({
          AccessToken: 'acc-1',
          ServerId: 'srv-1',
          User: { Id: 'u1', Name: 'alice', PrimaryImageTag: 'tag-1' },
        })
      );
      const auth = await adapter.loginWithQuickConnect('sec-1');
      expect(auth).toMatchObject({
        userId: 'u1',
        userName: 'alice',
        token: 'acc-1',
        serverId: 'srv-1',
      });
      expect(auth.avatarUrl).toContain('/Users/u1/Images/Primary');
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('POST');
      expect(req.url).toBe('http://srv/Users/AuthenticateWithQuickConnect');
      expect(req.body).toEqual({ Secret: 'sec-1' });
      // 授权前交换：设备头不带 token（与 M1 login 同语义，token 差异注入由 M1 headers 单测覆盖）
      const headers = req.headers as Record<string, string>;
      expect(headers.Authorization ?? headers['X-Emby-Authorization']).not.toContain('Token=');
      expect(headers['X-Emby-Token']).toBeUndefined();
    }
  });
});
