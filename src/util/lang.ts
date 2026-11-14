/**
 * 字幕语言归一化（M4 文档 §4.5 匹配定稿）：服务器 MediaStream.Language 形态不一
 * （zh/zho/chinese/chi…），统一归一到 ISO 639-2 三字码后与偏好等值比较。
 * 对 M3 §4.8.3「language 前缀匹配」的细化（前缀法匹配不到 zh/Chinese 形态的中文轨）。
 */
import { SUBTITLE_LANG_ALIAS_MAP } from '@/constant/subtitle';

/**
 * 轨道语言归一：小写化后查别名表（zh/zho/chinese→chi 等）；归一未命中返回小写原值
 * （已是三字码的 chi/eng/jpn/kor 原样透传，供与偏好等值比较）。
 *
 * @param language 服务器轨道 Language 原值（可能缺省）
 * @returns 归一后的小写语言码；入参缺省/空返回 undefined
 */
export function normalizeSubtitleLang(language: string | undefined): string | undefined {
  if (language === undefined || language === '') {
    return undefined;
  }
  const lower = language.toLowerCase();
  return SUBTITLE_LANG_ALIAS_MAP[lower] ?? lower;
}
