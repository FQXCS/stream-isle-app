/**
 * tokenVault 单测（M1 文档 §6.1 tokenVault 行 / §4.5.3）：
 * 保存后内存命中不再读 secure-store；删除双清；key 规范 token_{serverId}_{userId}。
 */
import { TOKEN_KEY_PREFIX } from '@/constant/storage';

import * as SecureStore from 'expo-secure-store';
import { deleteToken, getToken, getTokenFromMemory, saveToken } from '@/infra/tokenVault';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

describe('tokenVault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItemAsync.mockResolvedValue(null);
  });

  it('保存后内存命中：getToken 不再触发 secure-store 读取', async () => {
    await saveToken('srv1', 'user1', 'tok-abc');
    expect(setItemAsync).toHaveBeenCalledWith(
      `${TOKEN_KEY_PREFIX}srv1_user1`,
      'tok-abc'
    );
    const token = await getToken('srv1', 'user1');
    expect(token).toBe('tok-abc');
    expect(getItemAsync).not.toHaveBeenCalled();
  });

  it('未预热时回源 secure-store 并回填内存', async () => {
    getItemAsync.mockResolvedValueOnce('tok-cold');
    expect(getTokenFromMemory('srvX', 'userX')).toBeNull();
    const token = await getToken('srvX', 'userX');
    expect(token).toBe('tok-cold');
    expect(getItemAsync).toHaveBeenCalledWith(`${TOKEN_KEY_PREFIX}srvX_userX`);
    // 回填后内存命中
    expect(getTokenFromMemory('srvX', 'userX')).toBe('tok-cold');
  });

  it('删除双清（内存 + secure-store）', async () => {
    await saveToken('srv2', 'user2', 'tok-del');
    await deleteToken('srv2', 'user2');
    expect(deleteItemAsync).toHaveBeenCalledWith(`${TOKEN_KEY_PREFIX}srv2_user2`);
    expect(getTokenFromMemory('srv2', 'user2')).toBeNull();
  });

  it('key 规范 token_{serverId}_{userId}（SecureStore 不允许冒号）', async () => {
    await saveToken('a', 'b', 't');
    expect(setItemAsync.mock.calls[0][0]).toBe('token_a_b');
  });
});
