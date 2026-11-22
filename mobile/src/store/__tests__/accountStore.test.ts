/**
 * accountStore 单测（M1 文档 §6.1 accountStore 行 / §4.8）：
 * upsertServer 同 serverId 去重更新；多用户并存；setActive 切换后浏览缓存键隔离；
 * persist 快照无 token。
 */
import type { ServerInfo } from '@/adapter/model';
import { ACCOUNT_STORE_KEY } from '@/constant/storage';
import { mmkv } from '@/infra/storage';
import { useAccountStore } from '@/store/accountStore';
import { normalizeKinds, normalizeFilters, useBrowseStore, wallKeyOf } from '@/store/browseStore';
import { useSettingsStore } from '@/store/settingsStore';

jest.mock('@/infra/tlsBypass', () => ({
  syncTlsBypassHosts: jest.fn(),
  probeTls: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

/** 探测响应形态的 ServerInfo */
function serverInfoOf(serverId: string, overrides?: Partial<ServerInfo>): ServerInfo {
  return {
    flavor: 'JELLYFIN',
    baseUrl: `http://${serverId}:8096`,
    serverId,
    serverName: `Server ${serverId}`,
    version: '10.10.1',
    versionTooLow: false,
    ...overrides,
  };
}

function authOf(userId: string): { userId: string; userName: string; token: string; serverId: string } {
  return { userId, userName: `user-${userId}`, token: `token-${userId}`, serverId: '' };
}

describe('accountStore（多服务器多用户）', () => {
  beforeEach(() => {
    useAccountStore.setState({ servers: [], active: null });
    mmkv.clearAll();
  });

  it('upsertServer：同 serverId 去重更新，不重复建', () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertServer(serverInfoOf('srv1', { serverName: 'Renamed', version: '10.10.2' }));
    expect(useAccountStore.getState().servers).toHaveLength(1);
    expect(useAccountStore.getState().servers[0].serverName).toBe('Renamed');
    expect(useAccountStore.getState().servers[0].version).toBe('10.10.2');
  });

  it('多用户并存：同服务器追加第二个用户不覆盖已有用户', () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    store.actions.upsertUser('srv1', { ...authOf('u2'), serverId: 'srv1' });
    const server = useAccountStore.getState().servers[0];
    expect(server.users.map((user) => user.userId)).toEqual(['u1', 'u2']);
  });

  it('switchActiveUser 切换活跃 {serverId, userId}', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    await store.actions.switchActiveUser('srv1', 'u1');
    expect(useAccountStore.getState().active).toEqual({ serverId: 'srv1', userId: 'u1' });
    store.actions.upsertServer(serverInfoOf('srv2'));
    store.actions.upsertUser('srv2', { ...authOf('u9'), serverId: 'srv2' });
    await store.actions.switchActiveUser('srv2', 'u9');
    expect(useAccountStore.getState().active).toEqual({ serverId: 'srv2', userId: 'u9' });
  });

  it('clearActive 仅清活跃标记，服务器与用户记录保留', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    await store.actions.switchActiveUser('srv1', 'u1');
    useAccountStore.getState().actions.clearActive();
    const state = useAccountStore.getState();
    expect(state.active).toBeNull();
    expect(state.servers).toHaveLength(1);
    expect(state.servers[0].users).toHaveLength(1);
  });

  it('switchActiveUser 切换后浏览缓存键隔离：wallKey 随 serverId:userId 变化', async () => {
    const keyA = wallKeyOf('srv1', 'u1', 'lib1', {
      kinds: ['Movie', 'Series'],
      sortBy: 'SORT_NAME',
      sortOrder: 'ASC',
      filters: ['IsPlayed', 'IsUnplayed'],
    });
    const keyB = wallKeyOf('srv2', 'u9', 'lib1', {
      kinds: ['Series', 'Movie'],
      sortBy: 'SORT_NAME',
      sortOrder: 'ASC',
      filters: ['IsUnplayed', 'IsPlayed'],
    });
    // serverId:userId 不同 → 键不同（隔离）
    expect(keyA).not.toBe(keyB);
    expect(keyA.startsWith('srv1|u1|')).toBe(true);
    expect(keyB.startsWith('srv2|u9|')).toBe(true);
    // 同一组合不同传入顺序 → 同键（规范化去重/排序）
    expect(keyA).toBe(
      wallKeyOf('srv1', 'u1', 'lib1', {
        kinds: ['Series', 'Movie'],
        sortBy: 'SORT_NAME',
        sortOrder: 'ASC',
        filters: ['IsUnplayed', 'IsPlayed'],
      })
    );
    expect(normalizeKinds(['Series', 'Movie'])).toBe(normalizeKinds(['Movie', 'Series']));
    expect(normalizeFilters(['IsUnplayed', 'IsPlayed'])).toBe('IsPlayed,IsUnplayed');
  });

  it('persist 快照无 token 字段（MMKV 中无 token 线索）', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    await store.actions.switchActiveUser('srv1', 'u1');
    const snapshot = mmkv.getString(ACCOUNT_STORE_KEY) ?? '';
    expect(snapshot).toContain('user-u1');
    // Token 仅存 secure-store：快照不含 token 值或 token 键名
    expect(snapshot).not.toContain('token-u1');
    expect(snapshot.toLowerCase()).not.toContain('"token');
  });
});

describe('browseStore.resetAllForAccount（账号切换清理）', () => {
  it('清理指定 serverId:userId 前缀的全部缓存，保留其他账号', () => {
    useBrowseStore.setState({
      librariesByKey: {
        'srv1:u1': [{ id: 'l1', name: '电影', type: 'MOVIE' }],
        'srv2:u9': [{ id: 'l2', name: '剧集', type: 'TVSHOW' }],
      },
      walls: {
        'srv1|u1|lib1|Movie|SORT_NAME||': {
          items: [],
          total: 0,
          startIndex: 0,
          status: 'READY',
        },
        'srv2|u9|lib1|Series|SORT_NAME||': {
          items: [],
          total: 0,
          startIndex: 0,
          status: 'READY',
        },
      },
    });
    useBrowseStore.getState().actions.resetAllForAccount('srv1:u1');
    const state = useBrowseStore.getState();
    expect(Object.keys(state.librariesByKey)).toEqual(['srv2:u9']);
    expect(Object.keys(state.walls)).toEqual(['srv2|u9|lib1|Series|SORT_NAME||']);
  });
});

describe('accountStore.expireActiveUser（M4 §4.7 幂等登出）', () => {
  beforeEach(() => {
    useAccountStore.setState({ servers: [], active: null, reloginServerId: null, sessionExpired: false });
    mmkv.clearAll();
  });

  it('首次调用：清活跃标记 + 置失效标志 + 写入重登服务器上下文', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    await store.actions.switchActiveUser('srv1', 'u1');
    useAccountStore.getState().actions.expireActiveUser();
    const state = useAccountStore.getState();
    expect(state.active).toBeNull();
    expect(state.sessionExpired).toBe(true);
    expect(state.reloginServerId).toBe('srv1');
  });

  it('并发/连续调用幂等：仅首次生效，不覆盖服务器上下文，重登/切换后复位', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertServer(serverInfoOf('srv2'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    store.actions.upsertUser('srv2', { ...authOf('u2'), serverId: 'srv2' });
    await store.actions.switchActiveUser('srv1', 'u1');
    // 并发 401：同一页面多请求同时失败 → 连续两次调用
    useAccountStore.getState().actions.expireActiveUser();
    useAccountStore.getState().actions.expireActiveUser();
    let state = useAccountStore.getState();
    expect(state.sessionExpired).toBe(true);
    expect(state.reloginServerId).toBe('srv1');
    // 标志在 switchActiveUser（重登/切换）时复位（M4 §4.7）
    await useAccountStore.getState().actions.switchActiveUser('srv2', 'u2');
    state = useAccountStore.getState();
    expect(state.sessionExpired).toBe(false);
    // 复位后再次 401 可重新生效
    useAccountStore.getState().actions.expireActiveUser();
    expect(useAccountStore.getState().sessionExpired).toBe(true);
    expect(useAccountStore.getState().reloginServerId).toBe('srv2');
  });
});

describe('accountStore.removeServer（M4 §4.7 级联清理）', () => {
  const mockSyncTlsBypassHosts = jest.mocked(
    jest.requireMock<{ syncTlsBypassHosts: jest.Mock }>('@/infra/tlsBypass').syncTlsBypassHosts
  );

  beforeEach(() => {
    useAccountStore.setState({ servers: [], active: null, reloginServerId: null, sessionExpired: false });
    useBrowseStore.setState({ librariesByKey: {}, walls: {} });
    mockSyncTlsBypassHosts.mockClear();
  });

  it('级联：删 token、白名单清理回同步、浏览缓存清理各恰好一次', async () => {
    // deleteToken 经 tokenVault（expo-secure-store 已 mock）
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertServer(serverInfoOf('srv2'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    store.actions.upsertUser('srv2', { ...authOf('u2'), serverId: 'srv2' });
    store.actions.switchActiveUser('srv1', 'u1');
    // 白名单含 srv1 的 baseUrl；浏览缓存含两个账号
    useSettingsStore.getState().actions.setInsecureTlsAllowed('http://srv1:8096', true);
    useSettingsStore.getState().actions.setInsecureTlsAllowed('http://srv2:8097', true);
    useBrowseStore.setState({
      librariesByKey: {
        'srv1:u1': [{ id: 'l1', name: '电影', type: 'MOVIE' }],
        'srv2:u2': [{ id: 'l2', name: '剧集', type: 'TVSHOW' }],
      },
      walls: {
        'srv1|u1|lib1|Movie|SORT_NAME||': { items: [], total: 0, startIndex: 0, status: 'READY' },
        'srv2|u2|lib1|Series|SORT_NAME||': { items: [], total: 0, startIndex: 0, status: 'READY' },
      },
    });
    mockSyncTlsBypassHosts.mockClear();

    await useAccountStore.getState().actions.removeServer('srv1');
    // ① 服务器记录移除；④ 删除的是活跃服务器且有剩余用户 → 自动 switchActiveUser 到 srv2/u2
    const state = useAccountStore.getState();
    expect(state.servers.map((server) => server.serverId)).toEqual(['srv2']);
    expect(state.active).toEqual({ serverId: 'srv2', userId: 'u2' });
    // ② 白名单清理 + 全量回同步（重放剩余列表恰好一次）
    expect(useSettingsStore.getState().allowInsecureTls).toEqual(['http://srv2:8097']);
    expect(mockSyncTlsBypassHosts).toHaveBeenCalledTimes(1);
    expect(mockSyncTlsBypassHosts).toHaveBeenLastCalledWith(['http://srv2:8097']);
    // ③ 浏览缓存清理（srv1 全部）
    expect(Object.keys(useBrowseStore.getState().librariesByKey)).toEqual(['srv2:u2']);
    expect(Object.keys(useBrowseStore.getState().walls)).toEqual(['srv2|u2|lib1|Series|SORT_NAME||']);
  });

  it('删除活跃服务器且有剩余服务器用户：自动 switchActiveUser 到第一个剩余用户', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertServer(serverInfoOf('srv2'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    store.actions.upsertUser('srv2', { ...authOf('u2'), serverId: 'srv2' });
    store.actions.switchActiveUser('srv1', 'u1');

    await useAccountStore.getState().actions.removeServer('srv1');
    const state = useAccountStore.getState();
    expect(state.active).toEqual({ serverId: 'srv2', userId: 'u2' });
    expect(state.servers.map((server) => server.serverId)).toEqual(['srv2']);
  });

  it('删除非活跃服务器：活跃账号不受影响', async () => {
    const store = useAccountStore.getState();
    store.actions.upsertServer(serverInfoOf('srv1'));
    store.actions.upsertServer(serverInfoOf('srv2'));
    store.actions.upsertUser('srv1', { ...authOf('u1'), serverId: 'srv1' });
    store.actions.upsertUser('srv2', { ...authOf('u2'), serverId: 'srv2' });
    store.actions.switchActiveUser('srv2', 'u2');

    await useAccountStore.getState().actions.removeServer('srv1');
    expect(useAccountStore.getState().active).toEqual({ serverId: 'srv2', userId: 'u2' });
  });
});

describe('accountStore 线路（备用线路 / 故障转移）', () => {
  beforeEach(() => {
    useAccountStore.setState({ servers: [], active: null });
    mmkv.clearAll();
  });

  it('新建服务器自带一条默认线路（主线路）', () => {
    useAccountStore.getState().actions.upsertServer(serverInfoOf('srv1'));
    const server = useAccountStore.getState().servers[0];
    expect(server.routes).toEqual([
      { id: 'primary', name: '默认线路', baseUrl: 'http://srv1:8096' },
    ]);
    expect(server.activeRouteId).toBe('primary');
    expect(server.lastUsedAt).toEqual(expect.any(Number));
  });

  it('upsertRoute 追加备用线路；setActiveRoute 切换 baseUrl', () => {
    const actions = useAccountStore.getState().actions;
    actions.upsertServer(serverInfoOf('srv1'));
    actions.upsertRoute('srv1', { id: 'backup', name: '备用', baseUrl: 'http://10.0.0.2:8096' });
    expect(useAccountStore.getState().servers[0].routes).toHaveLength(2);

    actions.setActiveRoute('srv1', 'backup');
    const server = useAccountStore.getState().servers[0];
    expect(server.activeRouteId).toBe('backup');
    expect(server.baseUrl).toBe('http://10.0.0.2:8096');
  });

  it('advanceActiveRoute 循环切到下一条并返回新地址（单线路返回 null）', () => {
    const actions = useAccountStore.getState().actions;
    actions.upsertServer(serverInfoOf('srv1'));
    expect(actions.advanceActiveRoute('srv1')).toBeNull();

    actions.upsertRoute('srv1', { id: 'backup', name: '备用', baseUrl: 'http://10.0.0.2:8096' });
    expect(actions.advanceActiveRoute('srv1')).toBe('http://10.0.0.2:8096');
    expect(useAccountStore.getState().servers[0].baseUrl).toBe('http://10.0.0.2:8096');
    // 再切一次回到主线路
    expect(actions.advanceActiveRoute('srv1')).toBe('http://srv1:8096');
  });

  it('removeRoute 删除当前线路回退首条；最后一条不可删', () => {
    const actions = useAccountStore.getState().actions;
    actions.upsertServer(serverInfoOf('srv1'));
    actions.upsertRoute('srv1', { id: 'backup', name: '备用', baseUrl: 'http://10.0.0.2:8096' });
    actions.setActiveRoute('srv1', 'backup');
    actions.removeRoute('srv1', 'backup');
    const server = useAccountStore.getState().servers[0];
    expect(server.routes).toHaveLength(1);
    expect(server.activeRouteId).toBe('primary');
    expect(server.baseUrl).toBe('http://srv1:8096');

    actions.removeRoute('srv1', 'primary');
    expect(useAccountStore.getState().servers[0].routes).toHaveLength(1);
  });

  it('隐私服务器标记与统计缓存写入', () => {
    const actions = useAccountStore.getState().actions;
    actions.upsertServer(serverInfoOf('srv1'));
    actions.setServerPrivate('srv1', true);
    actions.setServerStats('srv1', { movieCount: 12, seriesCount: 3, refreshedAt: 1 });
    const server = useAccountStore.getState().servers[0];
    expect(server.private).toBe(true);
    expect(server.stats).toEqual({ movieCount: 12, seriesCount: 3, refreshedAt: 1 });
  });
});
