/**
 * jest 手动 mock：默认设备语言为中文，保持既有中文断言稳定；
 * 需要英文系统语言时调用 __setLocales([{ languageCode: 'en' }]) 并配合
 * resetSystemLanguageCache() 清缓存。
 */
interface MockLocale {
  languageCode?: string;
  languageTag?: string;
}

const ZH_LOCALE: MockLocale = { languageCode: 'zh', languageTag: 'zh-CN' };

let currentLocales: MockLocale[] = [ZH_LOCALE];

export function getLocales(): MockLocale[] {
  return currentLocales;
}

export function getCalendars(): unknown[] {
  return [];
}

export function useLocales(): MockLocale[] {
  return currentLocales;
}

export function useCalendars(): unknown[] {
  return [];
}

export function __setLocales(locales: MockLocale[]): void {
  currentLocales = locales;
}

export function __resetLocales(): void {
  currentLocales = [ZH_LOCALE];
}
