/**
 * 设备 ID（M1 文档 §4.2）：MediaBrowser 认证头 DeviceId 字段取值。
 * 首选 expo-application getAndroidId()（SSAID）；异常时生成 UUID 存 MMKV 兜底。
 */
import * as Application from 'expo-application';

import { DEVICE_ID_FALLBACK_KEY } from '@/constant/storage';
import { mmkv } from '@/infra/storage';

/** 内存缓存，避免每次认证头组装都查 MMKV */
let cachedDeviceId: string | null = null;

/** 生成 UUID v4（RN 环境无 crypto.randomUUID 保证，自行实现最简形态） */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * 取设备 ID：expo-application getAndroidId()，异常时生成 UUID 存 MMKV 兜底。
 */
export function getDeviceId(): string {
  if (cachedDeviceId !== null) {
    return cachedDeviceId;
  }
  let resolved: string;
  try {
    const androidId = Application.getAndroidId();
    resolved = androidId !== null && androidId !== '' ? androidId : fallbackDeviceId();
  } catch {
    // getAndroidId 在非原生环境（单测/预览）可能抛错，走 MMKV 兜底
    resolved = fallbackDeviceId();
  }
  cachedDeviceId = resolved;
  return cachedDeviceId;
}

/** MMKV 兜底：读取或生成 UUID 并持久化 */
function fallbackDeviceId(): string {
  const existing = mmkv.getString(DEVICE_ID_FALLBACK_KEY);
  if (existing) {
    return existing;
  }
  const fallback = generateUuid();
  mmkv.set(DEVICE_ID_FALLBACK_KEY, fallback);
  return fallback;
}
