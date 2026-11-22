/**
 * 服务器记录身份单测（M9）：同一台服务器（上游 serverId 相同）重复添加时
 * 生成独立的本地记录，不自动合并；显式传 recordId 时才为已有记录追加账号。
 */
import type { AuthResult, ServerInfo } from '@/adapter/model';
import { mmkv } from '@/infra/storage';
import { saveAccount } from '@/service/AuthService';
import { useAccountStore } from '@/store/accountStore';

jest.mock('@/adapter', () => ({
  createAdapter: jest.fn(() => ({})),
}));

jest.mock('@/infra/tlsBypass', () => ({
  syncTlsBypassHosts: jest.fn(),
  probeTls: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

function serverInfoOf(): ServerInfo {
  return {
    flavor: 'EMBY',
    baseUrl: 'http://192.168.0.102:8096',
    serverId: 'upstream-1',
    serverName: 'RYM',
    version: '4.10.2.0',
    versionTooLow: false,
  };
}

function authOf(userId: string): AuthResult {
  return { userId, userName: `user-${userId}`, token: `token-${userId}`, serverId: 'upstream-1' };
}

describe('服务器记录身份（同 IP 不自动合并）', () => {
  beforeEach(() => {
    useAccountStore.setState({ servers: [], active: null });
    mmkv.clearAll();
  });

  it('同一台服务器重复添加 → 两张独立卡片，本地 id 依次加后缀', async () => {
    const firstId = await saveAccount(serverInfoOf(), authOf('u1'));
    const secondId = await saveAccount(serverInfoOf(), authOf('u1'));

    expect(firstId).toBe('upstream-1');
    expect(secondId).toBe('upstream-1-2');

    const state = useAccountStore.getState();
    expect(state.servers).toHaveLength(2);
    expect(state.servers.map((server) => server.serverId)).toEqual(['upstream-1', 'upstream-1-2']);
    // 上游 id 保留，供编辑地址校验 / Quick Connect 匹配
    expect(state.servers[1].upstreamServerId).toBe('upstream-1');
    // 新记录成为活跃账号
    expect(state.active).toEqual({ serverId: 'upstream-1-2', userId: 'u1' });
  });

  it('传入 recordId → 重登替换已有账号（单账号模型），不新建卡片', async () => {
    const firstId = await saveAccount(serverInfoOf(), authOf('u1'));
    const secondId = await saveAccount(serverInfoOf(), authOf('u2'), firstId);

    expect(secondId).toBe('upstream-1');
    const state = useAccountStore.getState();
    expect(state.servers).toHaveLength(1);
    // 一个服务器只保留一组账号密码：旧账号被替换而不是追加
    expect(state.servers[0].users.map((user) => user.userId)).toEqual(['u2']);
    expect(state.active).toEqual({ serverId: 'upstream-1', userId: 'u2' });
  });

  it('本地 id 后缀使用 SecureStore 合法字符（token 键由其推导）', async () => {
    await saveAccount(serverInfoOf(), authOf('u1'));
    const secondId = await saveAccount(serverInfoOf(), authOf('u1'));
    expect(secondId).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
