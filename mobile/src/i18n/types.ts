/**
 * 国际化基础类型（中/英两语言）：
 * - AppLanguage：实际生效语言；
 * - LanguagePreference：设置页可选偏好（system = 跟随系统）；
 * - Message：文案值，字符串或按参数拼装的函数（英文单复数等）。
 */
export type AppLanguage = 'zh' | 'en';

export type LanguagePreference = 'system' | AppLanguage;

export type MessageParams = Readonly<Record<string, string | number>>;

export type Message = string | ((params: MessageParams) => string);
