/**
 * Token 保险库（M1 文档 §4.5.3；设计文档 §9）。
 * Token 不进 MMKV：secure-store 是持久副本，内存 Map 是运行时主副本。
 * 键规范：`token_{serverId}_{userId}`——由账号标识推导，MMKV 中不存在任何 token 线索。
 * 分隔符用下划线而非冒号：SecureStore key 仅允许字母数字与 . - _（存储键常量处有注）。
 */
import * as SecureStore from 'expo-secure-store';

import { TOKEN_KEY_PREFIX } from '@/constant/storage';

/** 内存缓存：运行时主副本（key: "token_{serverId}_{userId}"） */
const memoryCache = new Map<string, string>();

/** 由 (serverId, userId) 推导存储键（分隔符必须为 SecureStore 合法字符，不能用冒号） */
function tokenKeyOf(serverId: string, userId: string): string {
  return `${TOKEN_KEY_PREFIX}${serverId}_${userId}`;
}

/** 读 Token：内存命中直接返回，未命中回源 secure-store 并回填内存 */
export async function getToken(serverId: string, userId: string): Promise<string | null> {
  const key = tokenKeyOf(serverId, userId);
  const cached = memoryCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const persisted = await SecureStore.getItemAsync(key);
  if (persisted !== null) {
    memoryCache.set(key, persisted);
  }
  return persisted;
}

/** 同步读内存主副本（getActiveAdapter 组装认证头用；冷启动先经 warmupToken 预热） */
export function getTokenFromMemory(serverId: string, userId: string): string | null {
  return memoryCache.get(tokenKeyOf(serverId, userId)) ?? null;
}

/**
 * 冷启动预热：把指定账号的 Token 从 secure-store 读进内存主副本。
 * App 启动时序「tokenVault 就绪」（M1 §4.10）在渲染导航前 await 本函数。
 */
export async function warmupToken(serverId: string, userId: string): Promise<void> {
  await getToken(serverId, userId);
}

/** 写 Token：先写内存（主副本）再落 secure-store（持久副本） */
export async function saveToken(serverId: string, userId: string, token: string): Promise<void> {
  const key = tokenKeyOf(serverId, userId);
  memoryCache.set(key, token);
  await SecureStore.setItemAsync(key, token);
}

/** 删 Token：内存与 secure-store 双清 */
export async function deleteToken(serverId: string, userId: string): Promise<void> {
  const key = tokenKeyOf(serverId, userId);
  memoryCache.delete(key);
  await SecureStore.deleteItemAsync(key);
}
