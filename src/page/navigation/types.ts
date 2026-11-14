/**
 * 导航参数类型（M1 文档 §4.9；M2 增量 Item/Person/Player，M2 §4.5 路由表；
 * M5 增量 AlbumDetail/NowPlaying/PhotoViewer，M5 §4.15）。
 */
import type {
  ItemFilterEnum,
  LibraryTypeEnum,
  MediaLibrary,
  MediaItemTypeEnum,
  PlaybackSession,
  PhotoItem,
  ServerFlavor,
  ServerInfo,
  SortByEnum,
} from '@/adapter/model';
import type { ROUTES } from '@/constant/navigation';

/** 通用条目列表路由参数（合集子项/类型/标签/工作室过滤/插件频道节目） */
export interface ItemListParams {
  title: string;
  parentId?: string;
  kinds?: MediaItemTypeEnum[];
  filters?: ItemFilterEnum[];
  genreIds?: string[];
  tagFilters?: { id: string; name: string }[];
  studioIds?: string[];
  channelId?: string;
}

/** RootStack（native-stack）参数表 */
export type RootStackParamList = {
  [ROUTES.ONBOARDING_CONNECT]: undefined;
  /** Connect 正常流程带 serverInfo；401 重登路径带 serverId */
  [ROUTES.ONBOARDING_LOGIN]: { serverInfo?: ServerInfo; serverId?: string } | undefined;
  [ROUTES.TABS]: undefined;
  /** 搜索页：媒体库页头部搜索按钮进入（原生返回） */
  [ROUTES.SEARCH]: undefined;
  /** 添加服务器（mode=add，可选 flavor 预选）/ 编辑服务器（mode=edit） */
  [ROUTES.SERVER_ADD]: { mode: 'add'; flavor?: ServerFlavor } | { mode: 'edit'; serverId: string };
  /** 服务器排序（拖动调整卡片顺序） */
  [ROUTES.SERVER_SORT]: undefined;
  /** 线路管理：某服务器的全部线路 */
  [ROUTES.SERVER_ROUTES]: { serverId: string };
  /** 添加 / 编辑备用线路 */
  [ROUTES.SERVER_ROUTE_EDIT]: { serverId: string; routeId?: string };
  /** 全部媒体库列表：融合页「我的媒体 · 查看全部」入口 */
  [ROUTES.LIBRARY_LIST]: undefined;
  /** 媒体管理：服务器菜单进入，库显隐/顺序（服务器同步 + 本地兜底） */
  [ROUTES.MEDIA_MANAGE]: undefined;
  /** 海报墙页：库对象必传（M1 文档 §4.10） */
  [ROUTES.LIBRARY]: { library: MediaLibrary };
  /** 详情页：电影/剧集；Season/Episode 不进本页（季切换在页内、点集直接播，M2 §4.5） */
  [ROUTES.ITEM]: { itemId: string };
  /** 人物页：头像/简介/出演作品网格 */
  [ROUTES.PERSON]: { personId: string };
  /** 播放页：详情页 resolve 成功后携带会话进入；不参与状态恢复（M2 §4.5） */
  [ROUTES.PLAYER]: { session: PlaybackSession };
  /** M5：专辑/艺术家/歌单详情三态（M5 §4.15） */
  [ROUTES.ALBUM_DETAIL]: { kind: 'album' | 'artist' | 'playlist'; itemId: string };
  /** M5：Now Playing 全屏页 */
  [ROUTES.NOW_PLAYING]: undefined;
  /**
   * M5：照片查看器。totalCount 供页码分母、albumId 供查看器续载下一页（M5 §4.13）；
   * 仅元数据随栈传参（photoList 为已加载片段引用）；
   * sort 供非名称升序入口（首页每库行）续载保持同序，缺省名称升序（网格入口不变）
   */
  [ROUTES.PHOTO_VIEWER]: {
    albumId: string;
    totalCount: number;
    photoList: PhotoItem[];
    initialIndex: number;
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' };
  };
  /** M6：观看历史（设计文档 §10.2 已预留，M6 §4.10 注册） */
  [ROUTES.HISTORY]: undefined;
  /** M6：下载管理（设计文档 §10.2 已预留，M6 §4.10 注册） */
  [ROUTES.DOWNLOADS]: undefined;
  /** 收录类型设置二级页：继续观看/观看历史分别多选 */
  [ROUTES.MEDIA_TYPE_SETTINGS]: undefined;
  /** 软件更新页：检查 GitHub Releases 最新版本 */
  [ROUTES.SOFTWARE_UPDATE]: undefined;
  /** 库页配置：指定服务器类型后显示 Tab 分类/排序项入口 */
  [ROUTES.LIBRARY_DISPLAY_SETTINGS]: { flavor: ServerFlavor };
  /** 库页 Tab 分类配置（指定 flavor 后进入库类型列表） */
  [ROUTES.LIBRARY_TAB_SETTINGS]: { flavor: ServerFlavor };
  /** 某库类型的 Tab 编辑器（拖动排序） */
  [ROUTES.LIBRARY_TAB_EDITOR]: { flavor: ServerFlavor; libraryType: LibraryTypeEnum };
  /** 库页排序项配置（指定 flavor 后进入库类型列表） */
  [ROUTES.LIBRARY_SORT_SETTINGS]: { flavor: ServerFlavor };
  /** 某库类型的 Tab 列表（选择后进入排序编辑器） */
  [ROUTES.LIBRARY_SORT_TABS]: { flavor: ServerFlavor; libraryType: LibraryTypeEnum };
  /** 单 Tab 排序编辑器（拖动排序） */
  [ROUTES.LIBRARY_SORT_EDITOR]: {
    flavor: ServerFlavor;
    libraryType: LibraryTypeEnum;
    tabId: string;
  };
  /** 通用条目列表（合集子项/类型/标签/工作室过滤/插件频道节目） */
  [ROUTES.ITEM_LIST]: ItemListParams;
  /** 通用歌单详情（视频/混合歌单） */
  [ROUTES.PLAYLIST_DETAIL]: { playlistId: string; title?: string };
  /** 库内文件夹/相册下钻（原生 push 动画，标题为文件夹名；不含库页 Tab 栏） */
  [ROUTES.LIBRARY_FOLDER]: {
    libraryId: string;
    libraryType: LibraryTypeEnum;
    folderId: string;
    folderName: string;
    tabId: string;
    sortBy: SortByEnum;
    sortOrder: 'ASC' | 'DESC';
    kind: 'folder' | 'album';
  };
  /** M7：图书阅读器（Book 详情页进入；仅元数据传参，文件缓存与断点由阅读器页内经服务读取） */
  [ROUTES.BOOK_READER]: { itemId: string; name: string };
};

/** 底部三 Tab 参数表（媒体库融合页 / 媒体服务器 / 设置） */
export type TabsParamList = {
  [ROUTES.TAB_LIBRARIES]: undefined;
  [ROUTES.TAB_MEDIA_SERVER]: undefined;
  [ROUTES.TAB_SETTINGS]: undefined;
};
