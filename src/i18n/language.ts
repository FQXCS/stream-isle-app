/**
 * 系统语言解析：跟随系统偏好 → 设备语言；仅 zh* 落中文，其余一律英文。
 * 设备语言在进程内缓存（系统语言变化通常伴 Activity 重建/重启），测试可 reset。
 */
import { getLocales } from 'expo-localization';

import type { AppLanguage, LanguagePreference } from '@/i18n/types';

let cachedSystemLanguage: string | null | undefined;

/** 设备首选语言代码（如 zh / en / zh-Hans-CN）；读取失败返回 null */
export function getSystemLanguage(): string | null {
  if (cachedSystemLanguage === undefined) {
    const locale = getLocales()[0];
    cachedSystemLanguage = locale?.languageCode ?? locale?.languageTag ?? null;
  }
  return cachedSystemLanguage;
}

/** 测试用：清除设备语言缓存（配合 __mocks__/expo-localization 切换语言） */
export function resetSystemLanguageCache(): void {
  cachedSystemLanguage = undefined;
}

/**
 * 解析实际生效语言。
 * @param pref 设置偏好；非 system 时直接返回
 * @param systemCode 可选设备语言代码（不传则读取并缓存设备语言）
 */
export function resolveLanguage(
  pref: LanguagePreference,
  systemCode?: string | null
): AppLanguage {
  if (pref !== 'system') {
    return pref;
  }
  const code = (systemCode === undefined ? getSystemLanguage() : systemCode) ?? '';
  return code.toLowerCase().split(/[-_]/)[0] === 'zh' ? 'zh' : 'en';
}
