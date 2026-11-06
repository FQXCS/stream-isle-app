/**
 * i18n 统一出口：组件用 useT()，非组件（service/util）用 t()。
 * t() 每次调用读取 store 当前偏好；store 不反向依赖 i18n，避免循环。
 */
import { resolveLanguage } from '@/i18n/language';
import { translateFor } from '@/i18n/translate';
import type { MessageKey } from '@/i18n/messages/zh';
import type { MessageParams } from '@/i18n/types';
import { useSettingsStore } from '@/store/settingsStore';

export type { AppLanguage, LanguagePreference, Message, MessageParams } from '@/i18n/types';
export type { MessageKey } from '@/i18n/messages/zh';
export type { TFunction, TFunction as Translator } from '@/i18n/translate';
export { resolveLanguage, getSystemLanguage, resetSystemLanguageCache } from '@/i18n/language';
export { translateFor } from '@/i18n/translate';
export { useT } from '@/i18n/useT';
export { zh } from '@/i18n/messages/zh';
export { en } from '@/i18n/messages/en';

/** 非组件代码翻译（service/util/事件回调）：读取当前设置偏好 */
export function t(key: MessageKey, params?: MessageParams): string {
  return translateFor(resolveLanguage(useSettingsStore.getState().language), key, params);
}
