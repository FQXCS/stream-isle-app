/**
 * 路由名常量（M1 文档 §4.9；设计文档 §10.2）。
 * 16 键 = 15 个页面路由 + Tabs 容器键；M1 挂载 7 个页面屏幕 + Tabs 容器，
 * 其余由 M2–M6 实现后挂入，路由名先行固化。
 */
export const ROUTES = {
  ONBOARDING_CONNECT: 'OnboardingConnect',
  ONBOARDING_LOGIN: 'OnboardingLogin',
  TABS: 'Tabs',
  TAB_LIBRARIES: 'Tabs.Libraries',
  TAB_MEDIA_SERVER: 'Tabs.MediaServer',
  TAB_SETTINGS: 'Tabs.Settings',
  /** 搜索页（媒体库页头部入口进入，原底部 Tab 移出） */
  SEARCH: 'Search',
  /** 添加 / 编辑服务器表单（影视服务器页 + 号、卡片菜单「编辑」） */
  SERVER_ADD: 'ServerAdd',
  /** 服务器排序（影视服务器页「⋯ → 排序」） */
  SERVER_SORT: 'ServerSort',
  /** 线路管理（备用线路列表） */
  SERVER_ROUTES: 'ServerRoutes',
  /** 添加 / 编辑备用线路 */
  SERVER_ROUTE_EDIT: 'ServerRouteEdit',
  LIBRARY: 'Library',
  /** 全部媒体库列表（融合页「我的媒体 · 查看全部」） */
  LIBRARY_LIST: 'LibraryList',
  /** 媒体管理（服务器菜单进入：库显隐/顺序） */
  MEDIA_MANAGE: 'MediaManage',
  ITEM: 'Item',
  PERSON: 'Person',
  PLAYER: 'Player',
  ALBUM_DETAIL: 'AlbumDetail',
  NOW_PLAYING: 'NowPlaying',
  PHOTO_VIEWER: 'PhotoViewer',
  HISTORY: 'History',
  DOWNLOADS: 'Downloads',
  MEDIA_TYPE_SETTINGS: 'MediaTypeSettings',
  /** 软件更新（设置 → 关于 → 版本号进入） */
  SOFTWARE_UPDATE: 'SoftwareUpdate',
  LIBRARY_DISPLAY_SETTINGS: 'LibraryDisplaySettings',
  LIBRARY_TAB_SETTINGS: 'LibraryTabSettings',
  LIBRARY_TAB_EDITOR: 'LibraryTabEditor',
  LIBRARY_SORT_SETTINGS: 'LibrarySortSettings',
  LIBRARY_SORT_TABS: 'LibrarySortTabs',
  LIBRARY_SORT_EDITOR: 'LibrarySortEditor',
  ITEM_LIST: 'ItemList',
  PLAYLIST_DETAIL: 'PlaylistDetail',
  LIBRARY_FOLDER: 'LibraryFolder',
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
