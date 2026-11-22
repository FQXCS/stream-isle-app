/**
 * 库类型 → 占位图标映射（TV 侧自持，TV-m1 §4.4「我的媒体」库卡片行用）：
 * 与手机 @/component/LibraryCard 的 LIBRARY_ICON_MAP 同表——该模块不在 TV 白名单
 * （@/component 仅 AppIcon/useTheme/Toast 可 import），小表复制换白名单合规。
 */
import type { LibraryTypeEnum } from '@/adapter/model';
import type { AppIconName } from '@/component/AppIcon';

export const TV_LIBRARY_ICON_MAP: Record<LibraryTypeEnum, AppIconName> = {
  MOVIE: 'movie',
  TVSHOW: 'tv',
  MUSIC: 'audio',
  AUDIOBOOK: 'audiobook',
  MUSICVIDEO: 'musicVideo',
  PHOTO: 'photo',
  BOOK: 'book',
  BOXSET: 'boxset',
  PLAYLIST: 'playlist',
  GAME: 'game',
  LIVETV: 'liveTv',
  CHANNEL: 'channel',
  TRAILER: 'trailer',
  MIXED: 'mixed',
};
