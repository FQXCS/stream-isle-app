/**
 * 导航参数类型（M1 文档 §4.9；M2 增量 Item/Person/Player，02 §4.5 路由表；
 * M5 增量 AlbumDetail/NowPlaying/PhotoViewer，05 §4.15）。
 */
import type { MediaLibrary, PlaybackSession, PhotoItem, ServerInfo } from '@/adapter/model';
import type { ROUTES } from '@/constant/navigation';

/** RootStack（native-stack）参数表 */
export type RootStackParamList = {
  [ROUTES.ONBOARDING_CONNECT]: undefined;
  /** Connect 正常流程带 serverInfo；401 重登路径带 serverId */
  [ROUTES.ONBOARDING_LOGIN]: { serverInfo?: ServerInfo; serverId?: string } | undefined;
  [ROUTES.TABS]: undefined;
  /** 海报墙页：库对象必传（M1 文档 §4.10） */
  [ROUTES.LIBRARY]: { library: MediaLibrary };
  /** 详情页：电影/剧集；Season/Episode 不进本页（季切换在页内、点集直接播，02 §4.5） */
  [ROUTES.ITEM]: { itemId: string };
  /** 人物页：头像/简介/出演作品网格 */
  [ROUTES.PERSON]: { personId: string };
  /** 播放页：详情页 resolve 成功后携带会话进入；不参与状态恢复（02 §4.5） */
  [ROUTES.PLAYER]: { session: PlaybackSession };
  /** M5：专辑/艺术家/歌单详情三态（05 §4.15） */
  [ROUTES.ALBUM_DETAIL]: { kind: 'album' | 'artist' | 'playlist'; itemId: string };
  /** M5：Now Playing 全屏页（已在页内时重复 navigate 忽略由 MiniPlayer 保证） */
  [ROUTES.NOW_PLAYING]: undefined;
  /**
   * M5：照片查看器。totalCount 供页码分母、albumId 供查看器续载下一页（05 §4.13）；
   * 仅元数据随栈传参（photoList 为已加载片段引用）
   */
  [ROUTES.PHOTO_VIEWER]: {
    albumId: string;
    totalCount: number;
    photoList: PhotoItem[];
    initialIndex: number;
  };
  /** M6：观看历史（设计文档 §10.2 已预留，06 §4.10 注册） */
  [ROUTES.HISTORY]: undefined;
  /** M6：下载管理（设计文档 §10.2 已预留，06 §4.10 注册） */
  [ROUTES.DOWNLOADS]: undefined;
};

/** 底部四 Tab 参数表 */
export type TabsParamList = {
  [ROUTES.TAB_HOME]: undefined;
  [ROUTES.TAB_LIBRARIES]: undefined;
  [ROUTES.TAB_SEARCH]: undefined;
  [ROUTES.TAB_SETTINGS]: undefined;
};
