/**
 * 浏览域常量（M1 文档 §4.3）：分页、海报墙网格、排序/筛选选项、库类型映射。
 */
import type { LibraryTypeEnum, SortByEnum } from '@/adapter/model';

/** 服务端分页页大小 */
export const PAGE_SIZE = 40;

/** 首页三区横向卡片行长度（继续观看/下一集/最新添加共用，04 §3） */
export const HOME_ROW_LIMIT = 12;

/** 海报墙列数 */
export const GRID_COLUMNS = 3;

/** 滚动到底触发阈值（距底部 0.5 个项高） */
export const PAGE_END_THRESHOLD = 0.5;

/**
 * 排序选项（value 为服务器 SortBy 原值直传；随机排序忽略升降序，
 * 服务器端不支持其分页稳定性，见 M1 文档 §7 风险 7）。
 */
export const SORT_OPTIONS: readonly {
  value: SortByEnum;
  label: string;
  defaultOrder: 'ASC' | 'DESC' | null;
}[] = [
  { value: 'SORT_NAME', label: '名称', defaultOrder: 'ASC' },
  { value: 'PREMIERE_DATE', label: '首映日期', defaultOrder: 'DESC' },
  { value: 'RANDOM', label: '随机', defaultOrder: null },
];

/** 筛选选项（value 为服务器 Filters 原值，直传 ItemQuery.filters；「全部」不传 filters） */
export const FILTER_OPTIONS: readonly {
  value: 'IsUnplayed' | 'IsPlayed' | 'IsFavorite' | null;
  label: string;
}[] = [
  { value: null, label: '全部' },
  { value: 'IsUnplayed', label: '未看' },
  { value: 'IsPlayed', label: '已看' },
  { value: 'IsFavorite', label: '收藏' },
];

/**
 * 服务器 CollectionType → 客户端库类型。
 * 其余（homevideos、books、空值等）一律归 MIXED，进入后按视频库展示
 * （IncludeItemTypes=Movie,Series），库内无此类条目时自然呈现空态——不为低频类型单独建布局。
 */
export const COLLECTION_TYPE_MAP: Record<string, LibraryTypeEnum> = {
  movies: 'MOVIE',
  tvshows: 'TVSHOW',
  music: 'MUSIC',
  photos: 'PHOTO',
};

/** MIXED 库海报墙的条目类型（chips「全部」= Movie,Series） */
export const MIXED_LIBRARY_KINDS = ['Movie', 'Series'] as const;

/** 库数量/查询的条目类型口径（M1 文档 §4.6.3 getLibraryItemCount 行：MOVIE→Movie…MIXED→Movie,Series） */
export const INCLUDE_ITEM_TYPES_BY_LIBRARY: Record<LibraryTypeEnum, string> = {
  MOVIE: 'Movie',
  TVSHOW: 'Series',
  MUSIC: 'MusicAlbum',
  PHOTO: 'PhotoAlbum',
  MIXED: MIXED_LIBRARY_KINDS.join(','),
};
