/**
 * 账号凭据保险库（单账号模型）：把服务器账号密码加密存进 expo-secure-store
 * （Android Keystore / iOS Keychain 系统级加密），仅在使用时（自动重登）解密读取，
 * 明文不写 MMKV、不进内存缓存。
 * 键规范：`credential_{serverId}_{userId}`（SecureStore 仅允许字母数字与 . - _）。
 */
import * as SecureStore from 'expo-secure-store';

import { CREDENTIAL_KEY_PREFIX } from '@/constant/storage';

/** 由 (serverId, userId) 推导存储键 */
function credentialKeyOf(serverId: string, userId: string): string {
  return `${CREDENTIAL_KEY_PREFIX}${serverId}_${userId}`;
}

/** 保存/更新密码（空串等价于删除） */
export async function savePassword(serverId: string, userId: string, password: string): Promise<void> {
  const key = credentialKeyOf(serverId, userId);
  if (password === '') {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, password);
}

/** 读取密码（解密）；不存在返回 null */
export async function getPassword(serverId: string, userId: string): Promise<string | null> {
  return SecureStore.getItemAsync(credentialKeyOf(serverId, userId));
}

/** 删除密码（删除服务器 / 替换账号时调用） */
export async function deletePassword(serverId: string, userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(credentialKeyOf(serverId, userId));
}
