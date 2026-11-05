/**
 * 应用图标统一入口：语义名 → MaterialCommunityIcons（图标库优先）。
 * 图标库确无匹配时才在此登记自绘 SVG 兜底；业务组件不要直接 import 图标族。
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type AppIconName =
  // 导航 / 通用
  | 'back'
  | 'more'
  | 'plus'
  | 'edit'
  | 'eye'
  | 'eyeOff'
  | 'routes'
  | 'close'
  | 'check'
  | 'radioChecked'
  | 'radioUnchecked'
  | 'chevronRight'
  | 'chevronUp'
  | 'chevronDown'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'sort'
  | 'dragHandle'
  | 'history'
  | 'account'
  | 'star'
  | 'refresh'
  | 'info'
  // 底部 Tab
  | 'home'
  | 'library'
  | 'search'
  | 'server'
  | 'settings'
  // 播放控制 / 手势
  | 'play'
  | 'pause'
  | 'stop'
  | 'skipPrevious'
  | 'skipNext'
  | 'repeat'
  | 'repeatOne'
  | 'shuffle'
  | 'playlist'
  | 'playlistPlus'
  | 'lyrics'
  | 'bitrate'
  | 'brightness'
  | 'volume'
  | 'lock'
  | 'unlock'
  // 媒体 / 操作
  | 'heart'
  | 'heartOutline'
  | 'flag'
  | 'flagOutline'
  | 'download'
  | 'trash'
  | 'broom'
  | 'equalizer'
  | 'video'
  | 'audio'
  | 'subtitle'
  | 'file'
  // 库类型占位
  | 'movie'
  | 'tv'
  | 'audiobook'
  | 'musicVideo'
  | 'photo'
  | 'book'
  | 'boxset'
  | 'game'
  | 'liveTv'
  | 'channel'
  | 'trailer'
  | 'folder'
  | 'mixed';

const ICON_GLYPH_MAP: Record<AppIconName, MciName> = {
  back: 'chevron-left',
  more: 'dots-horizontal',
  close: 'close',
  check: 'check',
  plus: 'plus',
  edit: 'pencil',
  eye: 'eye',
  eyeOff: 'eye-off',
  routes: 'swap-horizontal',
  radioChecked: 'radiobox-marked',
  radioUnchecked: 'radiobox-blank',
  chevronRight: 'chevron-right',
  chevronUp: 'chevron-up',
  chevronDown: 'chevron-down',
  arrowLeft: 'arrow-left',
  arrowUp: 'arrow-up',
  arrowDown: 'arrow-down',
  sort: 'sort-variant',
  dragHandle: 'drag-vertical',
  history: 'history',
  account: 'account',
  star: 'star',
  refresh: 'refresh',
  info: 'information-outline',
  home: 'home',
  library: 'library',
  search: 'magnify',
  server: 'server',
  settings: 'cog',
  play: 'play',
  pause: 'pause',
  stop: 'stop',
  skipPrevious: 'skip-previous',
  skipNext: 'skip-next',
  repeat: 'repeat',
  repeatOne: 'repeat-once',
  shuffle: 'shuffle',
  playlist: 'playlist-music',
  playlistPlus: 'playlist-plus',
  lyrics: 'script-text-outline',
  bitrate: 'speedometer',
  brightness: 'brightness-6',
  volume: 'volume-high',
  lock: 'lock',
  unlock: 'lock-open',
  heart: 'heart',
  heartOutline: 'heart-outline',
  flag: 'flag',
  flagOutline: 'flag-outline',
  download: 'download',
  trash: 'delete',
  broom: 'broom',
  equalizer: 'equalizer',
  video: 'video',
  audio: 'music-note',
  subtitle: 'subtitles',
  file: 'file-document',
  movie: 'movie-open',
  tv: 'television-classic',
  audiobook: 'headphones',
  musicVideo: 'microphone-variant',
  photo: 'image-multiple',
  book: 'bookshelf',
  boxset: 'package-variant-closed',
  game: 'gamepad-variant',
  liveTv: 'broadcast',
  channel: 'radio',
  trailer: 'filmstrip',
  folder: 'folder',
  mixed: 'folder-multiple',
};

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
}

export function AppIcon({ name, size = 24, color = '#FFFFFF' }: AppIconProps) {
  return (
    <MaterialCommunityIcons
      name={ICON_GLYPH_MAP[name]}
      size={size}
      color={color}
      allowFontScaling={false}
      accessible={false}
    />
  );
}

/** 冷启动预热图标字体，避免首屏图标空一帧 */
export async function preloadAppIcons(): Promise<void> {
  await MaterialCommunityIcons.loadFont();
}
