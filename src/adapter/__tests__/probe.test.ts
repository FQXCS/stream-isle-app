/**
 * 探测单测（M1 文档 §6.1 probe 行）：flavor 判定四态 + versionTooLow。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import { PROBE_TIMEOUT_MS } from '@/constant/api';
import type { ApiClient } from '@/infra/api/ApiClient';

/** 注入 api 的 adapter 构造 */
function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('probe flavor 判定（ProductName）', () => {
  it('ProductName="Jellyfin Server" → JELLYFIN', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Id: 'srv-id-1',
      ServerName: 'My Jellyfin',
      Version: '10.10.1',
      ProductName: 'Jellyfin Server',
    });
    const info = await adapter.probe();
    expect(info.flavor).toBe('JELLYFIN');
    expect(info.serverId).toBe('srv-id-1');
    expect(info.serverName).toBe('My Jellyfin');
    expect(info.version).toBe('10.10.1');
    expect(info.versionTooLow).toBe(false);
    expect(info.baseUrl).toBe('http://srv');
  });

  it('ProductName="Emby Server" → EMBY', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Id: 'srv-id-2',
      ServerName: 'My Emby',
      Version: '4.9.0.30',
      ProductName: 'Emby Server',
    });
    const info = await adapter.probe();
    expect(info.flavor).toBe('EMBY');
    expect(info.versionTooLow).toBe(false);
  });

  it('ProductName 未知 → 抛 NOT_MEDIA_SERVER', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Id: 'x',
      ProductName: 'Router Admin',
    });
    await expect(adapter.probe()).rejects.toMatchObject({ code: 'NOT_MEDIA_SERVER' });
  });

  it('缺 ProductName → 抛 NOT_MEDIA_SERVER', async () => {
    const { adapter } = makeAdapter('EMBY', { Id: 'x' });
    await expect(adapter.probe()).rejects.toMatchObject({ code: 'NOT_MEDIA_SERVER' });
  });

  it('versionTooLow：Jellyfin 10.7.9（低于 10.8）警告；Emby 4.6.9（低于 4.7）警告', async () => {
    const lowJf = makeAdapter('JELLYFIN', {
      Id: 'x',
      Version: '10.7.9',
      ProductName: 'Jellyfin Server',
    });
    expect((await lowJf.adapter.probe()).versionTooLow).toBe(true);
    const lowEmby = makeAdapter('EMBY', { Id: 'x', Version: '4.6.9', ProductName: 'Emby Server' });
    expect((await lowEmby.adapter.probe()).versionTooLow).toBe(true);
    const okJf = makeAdapter('JELLYFIN', {
      Id: 'x',
      Version: '10.8.0',
      ProductName: 'Jellyfin Server',
    });
    expect((await okJf.adapter.probe()).versionTooLow).toBe(false);
    const okEmby = makeAdapter('EMBY', { Id: 'x', Version: '4.7', ProductName: 'Emby Server' });
    expect((await okEmby.adapter.probe()).versionTooLow).toBe(false);
  });

  it('探测请求带设备认证头且超时为 PROBE_TIMEOUT_MS', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN', {
      Id: 'x',
      Version: '10.10.0',
      ProductName: 'Jellyfin Server',
    });
    await adapter.probe();
    const req = api.request.mock.calls[0][0];
    expect(req.url).toBe('http://srv/System/Info/Public');
    expect(req.headers?.Authorization).toContain('MediaBrowser Client=');
    expect(req.timeoutMs).toBe(PROBE_TIMEOUT_MS);
    // 添加服务器连通测试上限 5s（2026-11 用户要求）
    expect(PROBE_TIMEOUT_MS).toBe(5000);
  });
});
