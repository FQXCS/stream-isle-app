/**
 * 浏览域常量（M1 文档 §4.3）：分页、海报墙网格、排序/筛选选项、库类型映射。
 */
import type { LibraryTypeEnum, MediaItemTypeEnum, SortByEnum } from '@/adapter/model';

/** 服务端分页页大小 */
export const PAGE_SIZE = 40;

/** 首页三区横向卡片行长度（继续观看/下一集/最新添加共用，04 §3） */
export const HOME_ROW_LIMIT = 12;

/**
 * 继续观看可选类型（设置页二级页多选）：仅视频类会记录服务端播放断点，
 * 图书/照片没有 PlaybackPositionTicks，选了也不会出现。
 */
export const RESUME_TYPE_OPTIONS: readonly { type: MediaItemTypeEnum; label: string }[] = [
  { type: 'Movie', label: '电影' },
  { type: 'Episode', label: '剧集' },
  { type: 'Video', label: '家庭视频' },
];

/**
 * 观看历史可选类型（设置页二级页多选）：视频类 + 有已看态的图书/音乐。
 * Book 需读到末页触发 markPlayed；Photo 因 App 不上报已看，暂不提供。
 */
export const HISTORY_TYPE_OPTIONS: readonly { type: MediaItemTypeEnum; label: string }[] = [
  ...RESUME_TYPE_OPTIONS,
  { type: 'Book', label: '图书' },
  { type: 'Audio', label: '音乐' },
];

/** 默认收录类型（继续观看/观看历史共用）：Movie,Episode,Video */
export const DEFAULT_FEED_TYPES: readonly MediaItemTypeEnum[] = ['Movie', 'Episode', 'Video'];

/** 海报墙列数 */
export const GRID_COLUMNS = 3;

/** 滚动到底触发阈值（距底部 0.5 个项高） */
export const PAGE_END_THRESHOLD = 0.5;

/**
 * 库页排序选项（参考稿排序菜单十三项；value 为客户端枚举，服务器参数名映射见 BaseAdapter）。
 * defaultOrder 为首次选中该字段时的排序方向；再次点击当前项由页面切换升降序
 * （随机排序无方向，defaultOrder 为 null，不显示箭头也不切换）。
 */
export const SORT_OPTIONS: readonly {
  value: SortByEnum;
  label: string;
  defaultOrder: 'ASC' | 'DESC' | null;
}[] = [
  { value: 'SORT_NAME', label: '标题', defaultOrder: 'ASC' },
  { value: 'DATE_CREATED', label: '添加日期', defaultOrder: 'DESC' },
  { value: 'PREMIERE_DATE', label: '发行日期', defaultOrder: 'DESC' },
  { value: 'COMMUNITY_RATING', label: '公众评分', defaultOrder: 'DESC' },
  { value: 'CRITIC_RATING', label: '影评人评分', defaultOrder: 'DESC' },
  { value: 'OFFICIAL_RATING', label: '分级', defaultOrder: 'DESC' },
  { value: 'PLAY_COUNT', label: '播放次数', defaultOrder: 'DESC' },
  { value: 'DATE_PLAYED', label: '播放日期', defaultOrder: 'DESC' },
  { value: 'FILENAME', label: '文件名', defaultOrder: 'ASC' },
  { value: 'RUNTIME', label: '文件时长', defaultOrder: 'DESC' },
  { value: 'FILE_SIZE', label: '文件大小', defaultOrder: 'DESC' },
  { value: 'CONTAINER', label: '文件格式', defaultOrder: 'ASC' },
  { value: 'RANDOM', label: '随机', defaultOrder: null },
];

/**
 * 库页视图段（分段控件互斥单选项）：all=全部条目、favorite=收藏、unplayed=未看、
 * movie/series=混合库类型拆分、folder=文件夹浏览（Recursive=false 逐级进入）。
 * 段位按库类型固定，不做超 4 段（分段控件放不下更多，长列表筛选应走菜单/弹层）。
 */
export type LibraryViewEnum = 'all' | 'favorite' | 'unplayed' | 'movie' | 'series' | 'folder';

/** 分段控件选项（与 SegmentedOption 同形） */
export interface LibraryViewOption {
  value: LibraryViewEnum;
  label: string;
}

/** 音乐库视图段：全部（歌曲）/ 艺人 / 文件夹 */
export type MusicViewEnum = 'all' | 'artist' | 'folder';
export const MUSIC_VIEW_OPTIONS: readonly { value: MusicViewEnum; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'artist', label: '艺人' },
  { value: 'folder', label: '文件夹' },
];

/** 照片库（家庭视频/照片混合库 homevideos）视图段：视频 / 图片 / 文件夹 */
export type PhotoViewEnum = 'video' | 'photo' | 'folder';
export const PHOTO_VIEW_OPTIONS: readonly { value: PhotoViewEnum; label: string }[] = [
  { value: 'video', label: '视频' },
  { value: 'photo', label: '图片' },
  { value: 'folder', label: '文件夹' },
];

/** 电影库：影片（全部）/ 收藏 / 未看 / 文件夹 */
export const MOVIE_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', label: '影片' },
  { value: 'favorite', label: '收藏' },
  { value: 'unplayed', label: '未看' },
  { value: 'folder', label: '文件夹' },
];

/** 剧集库：剧集（全部）/ 收藏 / 未看 / 文件夹 */
export const TVSHOW_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', label: '剧集' },
  { value: 'favorite', label: '收藏' },
  { value: 'unplayed', label: '未看' },
  { value: 'folder', label: '文件夹' },
];

/** 混合库：全部 / 电影 / 剧集 / 文件夹（保留类型拆分；4 段上限内不再放收藏/未看） */
export const MIXED_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', label: '全部' },
  { value: 'movie', label: '电影' },
  { value: 'series', label: '剧集' },
  { value: 'folder', label: '文件夹' },
];

/** 图书库：书籍 / 文件夹（图书无播放态与流派） */
export const BOOK_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', label: '书籍' },
  { value: 'folder', label: '文件夹' },
];

/** 库类型 → 视图段表（MUSIC/PHOTO 不走本表：音乐有独立视图段，照片为相册布局） */
export function libraryViewOptionsOf(type: LibraryTypeEnum): readonly LibraryViewOption[] {
  if (type === 'MOVIE') {
    return MOVIE_VIEW_OPTIONS;
  }
  if (type === 'TVSHOW') {
    return TVSHOW_VIEW_OPTIONS;
  }
  if (type === 'BOOK') {
    return BOOK_VIEW_OPTIONS;
  }
  return MIXED_VIEW_OPTIONS;
}

/**
 * 服务器 CollectionType → 客户端库类型。
 * homevideos 归 PHOTO：Emby/Jellyfin 该类型库普遍为照片+视频混合（家庭影集），
 * 视频墙口径（Movie,Series）对其恒为空，照片相册布局才可消费其内容；
 * 其余（playlists、livetv、空值等）仍归 MIXED，进入后按视频库展示
 * （IncludeItemTypes=Movie,Series），库内无此类条目时自然呈现空态——不为低频类型单独建布局。
 */
export const COLLECTION_TYPE_MAP: Record<string, LibraryTypeEnum> = {
  movies: 'MOVIE',
  tvshows: 'TVSHOW',
  music: 'MUSIC',
  photos: 'PHOTO',
  homevideos: 'PHOTO',
  books: 'BOOK',
};

/** MIXED 库海报墙的条目类型（chips「全部」= Movie,Series） */
export const MIXED_LIBRARY_KINDS = ['Movie', 'Series'] as const;

/**
 * 库数量/查询的条目类型口径（M1 文档 §4.6.3 getLibraryItemCount 行；M7 修订）：
 * MOVIE→Movie、TVSHOW→Series、BOOK→Book、MIXED→Movie,Series 不变；
 * MUSIC 由 MusicAlbum 改为 Audio——音乐库以「全部歌曲」为内容主体，
 * 按专辑计数会显示成个位数（如 asmr 库 5 专辑 vs 3361 首歌），与库页观感不符。
 * PHOTO 维持 PhotoAlbum（相册是照片库的顶层浏览单位）。
 */
export const INCLUDE_ITEM_TYPES_BY_LIBRARY: Record<LibraryTypeEnum, string> = {
  MOVIE: 'Movie',
  TVSHOW: 'Series',
  MUSIC: 'Audio',
  PHOTO: 'PhotoAlbum',
  BOOK: 'Book',
  MIXED: MIXED_LIBRARY_KINDS.join(','),
};
