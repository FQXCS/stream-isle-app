/**
 * 活跃账号 adapter 获取入口（M1 文档 §4.7；02 §4.1 / 05 §4.8 引用）。
 * 活跃账号切换/重登（token 变更）后由调用方重新获取。
 */
import { createAdapter } from '@/adapter';
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import { getActiveAccount, useAccountStore } from '@/store/accountStore';
import { getTokenFromMemory } from '@/infra/tokenVault';

/**
 * 取按活跃账号构造的 ServerAdapter 实例。
 * 前提：App 启动时已将活跃账号 Token 预热进内存（AuthService.warmupActiveToken，§4.10 启动时序
 * 「MMKV/tokenVault 就绪」）；此处只读内存命中，保持同步签名。
 */
export function getActiveAdapter(): ServerAdapter {
  const account = getActiveAccount();
  const state = useAccountStore.getState();
  const activeUserId = state.active?.userId ?? account.activeUserId;
  if (!activeUserId) {
    throw new Error('时序错误：活跃账号缺少 userId，不应调用 getActiveAdapter()');
  }
  const token = getTokenFromMemory(account.serverId, activeUserId);
  return createAdapter({ baseUrl: account.baseUrl, flavor: account.flavor, token });
}
