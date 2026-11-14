/**
 * 起播默认字幕选轨策略（M3 §4.8.3 + M4 §4.5 匹配定稿，仅首次起播/连播新集执行）：
 * 仅在可外挂注入的文本轨中匹配——非烧录且 vttUrl 已产出（DeliveryMethod 缺省/Embed 的轨
 * 无 vttUrl、播放器无法加载，命中会造成「高亮已选而画面无字幕」）；
 * normalizeSubtitleLang(track.language) 归一化后与偏好等值比较（M4 §4.5 定稿：
 * 前缀法匹配不到 zh/Chinese 形态的中文轨）→ isDefault → isForced；无命中不开启字幕。
 * 烧录轨不自动激活（烧录只由用户手动选择触发，减少转码触发面）。
 */
import type { SubtitleTrack } from '@/adapter/model';
import { normalizeSubtitleLang } from '@/util/lang';

/**
 * 自动选轨：返回命中的 streamIndex；无命中返回 null（不开启字幕）。
 *
 * @param subtitleList 会话字幕轨表（PlaybackSession.subtitleList）
 * @param preferred 偏好语言码（settingsStore.preferredSubtitleLang ?? DEFAULT_SUBTITLE_LANGUAGE）
 */
export function selectAutoSubtitleStreamIndex(
  subtitleList: SubtitleTrack[],
  preferred: string
): number | null {
  const textTracks = subtitleList.filter(
    (track) => !track.burnIn && track.vttUrl !== undefined
  );
  const matched =
    textTracks.find((track) => normalizeSubtitleLang(track.language) === preferred) ??
    textTracks.find((track) => track.isDefault) ??
    textTracks.find((track) => track.isForced);
  return matched?.streamIndex ?? null;
}
