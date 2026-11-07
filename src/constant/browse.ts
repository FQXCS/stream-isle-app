/**
 * 浏览域常量（M1 文档 §4.3）：分页、海报墙网格、排序/筛选选项、库类型映射。
 */
import type { LibraryTypeEnum, MediaItemTypeEnum, SortByEnum } from '@/adapter/model';
import type { MessageKey } from '@/i18n/messages/zh';

/** 服务端分页页大小 */
export const PAGE_SIZE = 40;

/** 首页三区横向卡片行长度（继续观看/下一集/最新添加共用，04 §3） */
export const HOME_ROW_LIMIT = 12;

/** 首页「最近添加」时间窗（天）：只收录最近 7 天入库的条目，排序仍按 DateCreated 降序 */
export const LATEST_WINDOW_DAYS = 7;

/** 媒体库融合页「我的媒体」下方每库横向行长度（每库最新添加前 20 条） */
export const LIBRARY_ROW_LIMIT = 20;

/** 融合页卡片统一高度：各分区（继续观看/下一集/最近添加/我的媒体/每库行）卡片同高 */
export const MEDIA_CARD_HEIGHT = 130;

/** 融合页 16:9 大卡宽度（继续观看与「我的媒体」共用，高宽比 16:9；高度 = MEDIA_CARD_HEIGHT） */
export const MEDIA_WIDE_CARD_WIDTH = Math.round((MEDIA_CARD_HEIGHT * 16) / 9);

/**
 * 继续观看可选类型（设置页二级页多选）：仅视频类会记录服务端播放断点，
 * 图书/照片没有 PlaybackPositionTicks，选了也不会出现。
 */
export const RESUME_TYPE_OPTIONS: readonly { type: MediaItemTypeEnum; labelKey: MessageKey }[] = [
  { type: 'Movie', labelKey: 'mediaType.movie' },
  { type: 'Episode', labelKey: 'mediaType.episode' },
  { type: 'Video', labelKey: 'mediaType.video' },
];

/**
 * 观看历史可选类型（设置页二级页多选）：视频类 + 有已看态的图书/音乐。
 * Book 需读到末页触发 markPlayed；Photo 因 App 不上报已看，暂不提供。
 */
export const HISTORY_TYPE_OPTIONS: readonly { type: MediaItemTypeEnum; labelKey: MessageKey }[] = [
  ...RESUME_TYPE_OPTIONS,
  { type: 'Book', labelKey: 'mediaType.book' },
  { type: 'Audio', labelKey: 'mediaType.audio' },
];

/** 默认收录类型（继续观看/观看历史共用）：Movie,Episode,Video */
export const DEFAULT_FEED_TYPES: readonly MediaItemTypeEnum[] = ['Movie', 'Episode', 'Video'];

/** 海报墙列数 */
export const GRID_COLUMNS = 3;

/** 滚动到底触发阈值（距底部 0.5 个项高） */
export const PAGE_END_THRESHOLD = 0.5;

/**
 * 排序选项（value 为客户端枚举，label 为菜单文案，defaultOrder 为首次选中该字段时的排序方向；
 * 随机排序无方向，defaultOrder 为 null，不显示箭头也不切换）。
 */
export interface SortOption {
  value: SortByEnum;
  labelKey: MessageKey;
  defaultOrder: 'ASC' | 'DESC' | null;
}

/**
 * 库页排序选项（参考稿排序菜单十三项；服务器参数名映射见 BaseAdapter）。
 * 仅用于视频类（电影/剧集/家庭视频）：这些条目有大小/容器/时长/评分元数据。
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'SORT_NAME', labelKey: 'sort.name', defaultOrder: 'ASC' },
  { value: 'DATE_CREATED', labelKey: 'sort.dateAdded', defaultOrder: 'DESC' },
  { value: 'PREMIERE_DATE', labelKey: 'sort.premiereDate', defaultOrder: 'DESC' },
  { value: 'COMMUNITY_RATING', labelKey: 'sort.communityRating', defaultOrder: 'DESC' },
  { value: 'CRITIC_RATING', labelKey: 'sort.criticRating', defaultOrder: 'DESC' },
  { value: 'OFFICIAL_RATING', labelKey: 'sort.officialRating', defaultOrder: 'DESC' },
  { value: 'PLAY_COUNT', labelKey: 'sort.playCount', defaultOrder: 'DESC' },
  { value: 'DATE_PLAYED', labelKey: 'sort.datePlayed', defaultOrder: 'DESC' },
  { value: 'FILENAME', labelKey: 'sort.fileName', defaultOrder: 'ASC' },
  { value: 'RUNTIME', labelKey: 'sort.runtime', defaultOrder: 'DESC' },
  { value: 'FILE_SIZE', labelKey: 'sort.fileSize', defaultOrder: 'DESC' },
  { value: 'CONTAINER', labelKey: 'sort.container', defaultOrder: 'ASC' },
  { value: 'RANDOM', labelKey: 'sort.random', defaultOrder: null },
];

/** 音频专有排序项（Emby 音乐排序词表；仅音乐库菜单展示） */
const AUDIO_ONLY_SORT_OPTIONS: readonly SortOption[] = [
  { value: 'ALBUM', labelKey: 'sort.album', defaultOrder: 'ASC' },
  { value: 'ALBUM_ARTIST', labelKey: 'sort.albumArtist', defaultOrder: 'ASC' },
];

/** 排序项查表（分组选项按 value 复用既有标签与默认方向） */
const SORT_OPTION_MAP: Record<string, SortOption> = Object.fromEntries(
  [...SORT_OPTIONS, ...AUDIO_ONLY_SORT_OPTIONS].map((option) => [option.value, option])
);

/** 按给定顺序取排序项（顺序即菜单展示顺序） */
function sortOptionsOf(valueList: readonly SortByEnum[]): readonly SortOption[] {
  return valueList.map((value) => SORT_OPTION_MAP[value]);
}

/**
 * 音频（全部歌曲）排序项：Emby Web 音频菜单中本库有值的字段（实测大小/容器/时长均生效），
 * 相对顺序沿用 SORT_OPTIONS；专辑/专辑艺人紧跟标题。
 */
export const AUDIO_SORT_OPTIONS: readonly SortOption[] = sortOptionsOf([
  'SORT_NAME',
  'ALBUM',
  'ALBUM_ARTIST',
  'DATE_CREATED',
  'PREMIERE_DATE',
  'PLAY_COUNT',
  'DATE_PLAYED',
  'FILENAME',
  'RUNTIME',
  'FILE_SIZE',
  'CONTAINER',
  'RANDOM',
]);

/** 音乐艺人：虚拟条目，仅名称/添加日期/随机有排序意义 */
export const ARTIST_SORT_OPTIONS: readonly SortOption[] = sortOptionsOf([
  'SORT_NAME',
  'DATE_CREATED',
  'RANDOM',
]);

/** 书库：仅名称/添加日期/播放态/文件名有值（首映日期/评分/时长/大小/容器实测为空） */
export const BOOK_SORT_OPTIONS: readonly SortOption[] = sortOptionsOf([
  'SORT_NAME',
  'DATE_CREATED',
  'PLAY_COUNT',
  'DATE_PLAYED',
  'FILENAME',
]);

/** 照片：名称/日期/文件名/容器/随机；评分与播放态基本无值，大小/时长实测不生效 */
export const PHOTO_SORT_OPTIONS: readonly SortOption[] = sortOptionsOf([
  'SORT_NAME',
  'DATE_CREATED',
  'PREMIERE_DATE',
  'FILENAME',
  'CONTAINER',
  'RANDOM',
]);

/** 文件夹视图：子目录无大小/容器/时长/评分/播放态，仅名称/添加日期/文件名/随机 */
export const FOLDER_SORT_OPTIONS: readonly SortOption[] = sortOptionsOf([
  'SORT_NAME',
  'DATE_CREATED',
  'FILENAME',
  'RANDOM',
]);

/**
 * 库页视图段（分段控件互斥单选项）：all=全部条目、favorite=收藏、unplayed=未看、
 * movie/series=混合库类型拆分、folder=文件夹浏览（Recursive=false 逐级进入）。
 * 段位按库类型固定，不做超 4 段（分段控件放不下更多，长列表筛选应走菜单/弹层）。
 */
export type LibraryViewEnum = 'all' | 'favorite' | 'unplayed' | 'movie' | 'series' | 'folder';

/** 分段控件选项（与 SegmentedOption 同形） */
export interface LibraryViewOption {
  value: LibraryViewEnum;
  labelKey: MessageKey;
}

/** 音乐库视图段：全部（歌曲）/ 艺人 / 文件夹 */
export type MusicViewEnum = 'all' | 'artist' | 'folder';
export const MUSIC_VIEW_OPTIONS: readonly { value: MusicViewEnum; labelKey: MessageKey }[] = [
  { value: 'all', labelKey: 'tab.all' },
  { value: 'artist', labelKey: 'tab.artists' },
  { value: 'folder', labelKey: 'tab.folders' },
];

/** 照片库（家庭视频/照片混合库 homevideos）视图段：视频 / 图片 / 文件夹 */
export type PhotoViewEnum = 'video' | 'photo' | 'folder';
export const PHOTO_VIEW_OPTIONS: readonly { value: PhotoViewEnum; labelKey: MessageKey }[] = [
  { value: 'video', labelKey: 'tab.videos' },
  { value: 'photo', labelKey: 'tab.images' },
  { value: 'folder', labelKey: 'tab.folders' },
];

/** 电影库：影片（全部）/ 收藏 / 未看 / 文件夹 */
export const MOVIE_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', labelKey: 'tab.movies' },
  { value: 'favorite', labelKey: 'tab.favorites' },
  { value: 'unplayed', labelKey: 'tab.unplayed' },
  { value: 'folder', labelKey: 'tab.folders' },
];

/** 剧集库：剧集（全部）/ 收藏 / 未看 / 文件夹 */
export const TVSHOW_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', labelKey: 'tab.series' },
  { value: 'favorite', labelKey: 'tab.favorites' },
  { value: 'unplayed', labelKey: 'tab.unplayed' },
  { value: 'folder', labelKey: 'tab.folders' },
];

/** 混合库：全部 / 电影 / 剧集 / 文件夹（保留类型拆分；4 段上限内不再放收藏/未看） */
export const MIXED_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', labelKey: 'tab.all' },
  { value: 'movie', labelKey: 'tab.movie' },
  { value: 'series', labelKey: 'tab.series' },
  { value: 'folder', labelKey: 'tab.folders' },
];

/** 图书库：书籍 / 文件夹（图书无播放态与流派） */
export const BOOK_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  { value: 'all', labelKey: 'tab.books' },
  { value: 'folder', labelKey: 'tab.folders' },
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
 * 其余未映射值（folders、mixed、空值等）仍归 MIXED，进入后按视频库展示。
 */
export const COLLECTION_TYPE_MAP: Record<string, LibraryTypeEnum> = {
  movies: 'MOVIE',
  tvshows: 'TVSHOW',
  music: 'MUSIC',
  audiobooks: 'AUDIOBOOK',
  musicvideos: 'MUSICVIDEO',
  photos: 'PHOTO',
  homevideos: 'PHOTO',
  books: 'BOOK',
  boxsets: 'BOXSET',
  playlists: 'PLAYLIST',
  games: 'GAME',
  livetv: 'LIVETV',
  channels: 'CHANNEL',
  trailers: 'TRAILER',
};

/** MIXED 库海报墙的条目类型（chips「全部」= Movie,Series） */
export const MIXED_LIBRARY_KINDS = ['Movie', 'Series'] as const;

/**
 * 库数量/查询的条目类型口径（M1 文档 §4.6.3 getLibraryItemCount 行；M7 修订）：
 * MOVIE→Movie、TVSHOW→Series、BOOK→Book、MIXED→Movie,Series 不变；
 * MUSIC 由 MusicAlbum 改为 Audio——音乐库以「全部歌曲」为内容主体，
 * 按专辑计数会显示成个位数（如 asmr 库 5 专辑 vs 3361 首歌），与库页观感不符。
 * PHOTO 维持 PhotoAlbum（相册是照片库的顶层浏览单位）。
 * 新增库类型按主内容类型计数；LIVETV/CHANNEL 失败由 fetchLibraries 容错。
 */
export const INCLUDE_ITEM_TYPES_BY_LIBRARY: Record<LibraryTypeEnum, string> = {
  MOVIE: 'Movie',
  TVSHOW: 'Series',
  MUSIC: 'Audio',
  AUDIOBOOK: 'MusicAlbum',
  MUSICVIDEO: 'MusicVideo',
  PHOTO: 'PhotoAlbum',
  BOOK: 'Book',
  BOXSET: 'BoxSet',
  PLAYLIST: 'Playlist',
  GAME: 'Game',
  LIVETV: 'TvChannel',
  CHANNEL: 'Channel',
  TRAILER: 'Trailer',
  MIXED: MIXED_LIBRARY_KINDS.join(','),
};
