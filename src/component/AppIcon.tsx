/**
 * 应用图标集（M8 增量）：react-native-svg 单文件收口，24×24 视口，
 * 详情页操作区、详情「更多」菜单、库页长按菜单共用；颜色与尺寸由调用方注入。
 */
import Svg, { Path } from 'react-native-svg';

export type AppIconName =
  | 'back'
  | 'more'
  | 'play'
  | 'heart'
  | 'heartOutline'
  | 'flag'
  | 'flagOutline'
  | 'download'
  | 'trash'
  | 'video'
  | 'audio'
  | 'subtitle'
  | 'file';

const ICON_PATH_MAP: Record<AppIconName, readonly string[]> = {
  back: ['M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z'],
  more: [
    'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  ],
  play: ['M8 5v14l11-7z'],
  heart: [
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  ],
  heartOutline: [
    'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  ],
  flag: ['M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z'],
  flagOutline: [
    'M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6h-5.2zm2.5 6h-3.9l-.4-2H7V6h5.6l.4 2h3.9v4z',
  ],
  download: ['M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z'],
  trash: [
    'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  ],
  video: [
    'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  ],
  audio: [
    'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
  ],
  subtitle: [
    'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z',
  ],
  file: [
    'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  ],
};

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
}

export function AppIcon({ name, size = 24, color = '#FFFFFF' }: AppIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ICON_PATH_MAP[name].map((path) => (
        <Path key={path} d={path} fill={color} />
      ))}
    </Svg>
  );
}
