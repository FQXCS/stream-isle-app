/**
 * 路由名常量（M1 文档 §4.9；设计文档 §10.2）。
 * 16 键 = 15 个页面路由 + Tabs 容器键；M1 挂载 7 个页面屏幕 + Tabs 容器，
 * 其余由 M2–M6 实现后挂入，路由名先行固化。
 */
export const ROUTES = {
  ONBOARDING_CONNECT: 'OnboardingConnect',
  ONBOARDING_LOGIN: 'OnboardingLogin',
  TABS: 'Tabs',
  TAB_HOME: 'Tabs.Home',
  TAB_LIBRARIES: 'Tabs.Libraries',
  TAB_SEARCH: 'Tabs.Search',
  TAB_SETTINGS: 'Tabs.Settings',
  LIBRARY: 'Library',
  ITEM: 'Item',
  PERSON: 'Person',
  PLAYER: 'Player',
  ALBUM_DETAIL: 'AlbumDetail',
  NOW_PLAYING: 'NowPlaying',
  PHOTO_VIEWER: 'PhotoViewer',
  HISTORY: 'History',
  DOWNLOADS: 'Downloads',
  BOOK_READER: 'BookReader',
} as const;

/** ROUTES 值联合（供导航类型 ParamList 使用） */
export type RouteName = (typeof ROUTES)[keyof typeof ROUTES];

/** 隐藏迷你播放条的路由（全屏沉浸页：视频播放器 / Now Playing / 照片查看器 / 图书阅读器，M5 文档 §4.10） */
export const MINI_PLAYER_HIDDEN_ROUTES: readonly string[] = [
  ROUTES.PLAYER,
  ROUTES.NOW_PLAYING,
  ROUTES.PHOTO_VIEWER,
  ROUTES.BOOK_READER,
];
