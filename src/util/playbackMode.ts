/**
 * 播放模式合并展示口径（M5 文档 §4.10/§4.11）：shuffle 优先，其次单曲循环，其余列表循环。
 * NowPlaying 模式按钮与队列面板标题共用同一份 labelKey/icon，避免两处各写一套映射。
 */
import type { RepeatModeEnum } from '@/adapter/model';
import type { AppIconName } from '@/component/AppIcon';
import type { MessageKey } from '@/i18n';

/** 合并展示态 */
export type PlaybackModeEnum = 'queue' | 'shuffle' | 'track';

/** 模式文案与图标（队列标题、模式按钮同源；文案经 tr(labelKey) 取当前语言） */
export const PLAYBACK_MODE_META: Record<
  PlaybackModeEnum,
  { labelKey: MessageKey; icon: AppIconName }
> = {
  queue: { labelKey: 'player.mode.queue', icon: 'repeat' },
  shuffle: { labelKey: 'player.mode.shuffle', icon: 'shuffle' },
  track: { labelKey: 'player.mode.track', icon: 'repeatOne' },
};

/** repeatMode + shuffle → 合并展示态（off 归入列表循环，与既有模式按钮口径一致） */
export function combinedPlaybackMode(
  repeatMode: RepeatModeEnum,
  shuffle: boolean
): PlaybackModeEnum {
  if (shuffle) {
    return 'shuffle';
  }
  return repeatMode === 'track' ? 'track' : 'queue';
}
