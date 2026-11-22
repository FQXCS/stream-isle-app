/**
 * 纯翻译函数：给定语言 + key → 文案；不依赖 store，便于单测与复用。
 * 插值占位符统一为 {name}；函数型消息（英文单复数）收到同一份参数。
 */
import { en } from '@/i18n/messages/en';
import { zh, type MessageKey } from '@/i18n/messages/zh';
import type { AppLanguage, Message, MessageParams } from '@/i18n/types';

const MESSAGE_TABLE: Record<AppLanguage, Record<MessageKey, Message>> = { zh, en };

export type TFunction = (key: MessageKey, params?: MessageParams) => string;

function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

/** 指定语言翻译（缺 key 时回退中文，再回退 key 本身） */
export function translateFor(
  language: AppLanguage,
  key: MessageKey,
  params?: MessageParams
): string {
  const message = MESSAGE_TABLE[language][key] ?? zh[key] ?? key;
  if (typeof message === 'function') {
    return message(params ?? {});
  }
  return interpolate(message, params);
}
