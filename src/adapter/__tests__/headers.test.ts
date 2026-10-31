/**
 * 认证头单测（M1 文档 §6.1 headers 行 / §4.6.4 差异表）：
 * Client/Device/DeviceId/Version 无魔法值，全部经构造注入断言。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

/** 组装请求捕获器：注入 api 捕获 headers（探测/登录分别回有效响应） */
function captureApi() {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const api = {
    request: jest.fn(async (req: { url: string; headers?: Record<string, string> }) => {
      calls.push(req);
      if (req.url.includes('/Users/AuthenticateByName')) {
        return { AccessToken: 'tok-login', ServerId: 'srv-1', User: { Id: 'u1', Name: 'alice' } };
      }
      return { Id: 'srv-1', ServerName: 'Srv', Version: '10.10.0', ProductName: 'Jellyfin Server' };
    }),
  } as unknown as ApiClient;
  return { api, calls };
}

const DEPS = {
  clientName: 'Stream Isle Mobile',
  deviceName: 'Pixel Test',
  deviceId: 'device-123',
  appVersion: '0.1.0',
};

describe('认证头组装（flavor 差异）', () => {
  it('Jellyfin 登录后：Token 拼入同一 Authorization 头（官方推荐格式）', async () => {
    const { api, calls } = captureApi();
    const adapter = new JellyfinAdapter(
      { baseUrl: 'http://jf:8096', flavor: 'JELLYFIN', token: 't1' },
      { ...DEPS, api }
    );
    await adapter.listItems({ userId: 'u1', parentId: 'lib1', startIndex: 0, limit: 40 });
    expect(calls[0].headers?.Authorization).toBe(
      'MediaBrowser Client="Stream Isle Mobile", Device="Pixel Test", DeviceId="device-123", Version="0.1.0", Token="t1"'
    );
  });

  it('Jellyfin 登录前：Authorization 设备头无 Token 段', async () => {
    const { api, calls } = captureApi();
    const adapter = new JellyfinAdapter(
      { baseUrl: 'http://jf:8096', flavor: 'JELLYFIN' },
      { ...DEPS, api }
    );
    await adapter.probe();
    expect(calls[0].headers?.Authorization).toBe(
      'MediaBrowser Client="Stream Isle Mobile", Device="Pixel Test", DeviceId="device-123", Version="0.1.0"'
    );
  });

  it('Emby 登录前：X-Emby-Authorization 设备头', async () => {
    const { api, calls } = captureApi();
    const adapter = new EmbyAdapter(
      { baseUrl: 'http://emby:8097', flavor: 'EMBY' },
      { ...DEPS, api }
    );
    await adapter.probe();
    expect(calls[0].headers?.['X-Emby-Authorization']).toBe(
      'MediaBrowser Client="Stream Isle Mobile", Device="Pixel Test", DeviceId="device-123", Version="0.1.0"'
    );
  });

  it('Emby 登录后：X-Emby-Token 独立头（设备头仍带）', async () => {
    const { api, calls } = captureApi();
    const adapter = new EmbyAdapter(
      { baseUrl: 'http://emby:8097', flavor: 'EMBY', token: 't1' },
      { ...DEPS, api }
    );
    await adapter.listItems({ userId: 'u1', parentId: 'lib1', startIndex: 0, limit: 40 });
    expect(calls[0].headers?.['X-Emby-Authorization']).toBe(
      'MediaBrowser Client="Stream Isle Mobile", Device="Pixel Test", DeviceId="device-123", Version="0.1.0"'
    );
    expect(calls[0].headers?.['X-Emby-Token']).toBe('t1');
  });

  it('登录请求 body：{ Username, Pw }（两端字段一致）', async () => {
    const { api, calls } = captureApi();
    const adapter = new JellyfinAdapter(
      { baseUrl: 'http://jf:8096', flavor: 'JELLYFIN' },
      { ...DEPS, api }
    );
    await adapter.login('alice', 'secret');
    expect(calls[0].url).toBe('http://jf:8096/Users/AuthenticateByName');
    expect((api.request as jest.Mock).mock.calls[0][0].body).toEqual({
      Username: 'alice',
      Pw: 'secret',
    });
  });
});
