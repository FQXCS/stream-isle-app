/**
 * 字幕语言选项常量（04 文档 §4.5/§4.8 定稿；03 开放问题 4 授权 M4 定稿）。
 * settingsStore.preferredSubtitleLang 默认 null → 消费时取 DEFAULT_SUBTITLE_LANGUAGE("chi")
 * 自动选轨；「关闭自动选轨」不在取值集内（04 开放问题 5）。
 */
import { DEFAULT_SUBTITLE_LANGUAGE } from '@/constant/playback';

/** 字幕语言选项（code: string | null；UI 单选 key 用 code ?? "default"） */
export interface SubtitleLangOption {
  /** ISO 639-2 三字码；null = 跟随默认（自动选中文字幕） */
  code: string | null;
  label: string;
}

/** 选项清单（04 §4.5 定稿）：跟随默认（中文）/ 中文 / 英语 / 日语 / 韩语 */
export const SUBTITLE_LANG_OPTION_LIST: readonly SubtitleLangOption[] = [
  { code: null, label: `跟随默认（中文）` },
  { code: 'chi', label: '中文' },
  { code: 'eng', label: '英语' },
  { code: 'jpn', label: '日语' },
  { code: 'kor', label: '韩语' },
];

/**
 * 语言别名归一表（04 §4.5 匹配定稿）：服务器轨 Language 可能是 zh/zho/chinese 等形态，
 * 统一归一到 ISO 639-2 三字码再与偏好等值比较。
 */
export const SUBTITLE_LANG_ALIAS_MAP: Readonly<Record<string, string>> = {
  zh: 'chi',
  zho: 'chi',
  chinese: 'chi',
  en: 'eng',
  english: 'eng',
  ja: 'jpn',
  japanese: 'jpn',
  ko: 'kor',
  korean: 'kor',
};

/** 缺省偏好消费值（沿用 M3 既有常量；此处转出供 util/lang 与页面共用） */
export const DEFAULT_SUBTITLE_LANG = DEFAULT_SUBTITLE_LANGUAGE;
