/**
 * 排序目录（docs/09 §1.3/§2.4/§4）：客户端排序项 → 双端服务器参数链，以及每个
 * 条目类型可用的排序集合。设置页按 flavor 过滤 null 项；库页 SortMenu 按解析结果展示。
 */
import type { ServerFlavor, SortByEnum } from '@/adapter/model';
import {
  ARTIST_SORT_OPTIONS,
  AUDIO_SORT_OPTIONS,
  BOOK_SORT_OPTIONS,
  FOLDER_SORT_OPTIONS,
  PHOTO_SORT_OPTIONS,
  SORT_OPTIONS,
  type SortOption,
} from '@/constant/browse';

/** 排序项元数据（label/defaultOrder 与既有菜单一致；新项按 docs/09 中文名） */
export const SORT_OPTION_META: Record<SortByEnum, SortOption> = {
  SORT_NAME: { value: 'SORT_NAME', label: '标题', defaultOrder: 'ASC' },
  DATE_CREATED: { value: 'DATE_CREATED', label: '添加日期', defaultOrder: 'DESC' },
  PREMIERE_DATE: { value: 'PREMIERE_DATE', label: '发行日期', defaultOrder: 'DESC' },
  COMMUNITY_RATING: { value: 'COMMUNITY_RATING', label: '公众评分', defaultOrder: 'DESC' },
  CRITIC_RATING: { value: 'CRITIC_RATING', label: '影评人评分', defaultOrder: 'DESC' },
  OFFICIAL_RATING: { value: 'OFFICIAL_RATING', label: '分级', defaultOrder: 'DESC' },
  PLAY_COUNT: { value: 'PLAY_COUNT', label: '播放次数', defaultOrder: 'DESC' },
  DATE_PLAYED: { value: 'DATE_PLAYED', label: '播放日期', defaultOrder: 'DESC' },
  FILENAME: { value: 'FILENAME', label: '文件名', defaultOrder: 'ASC' },
  RUNTIME: { value: 'RUNTIME', label: '文件时长', defaultOrder: 'DESC' },
  FILE_SIZE: { value: 'FILE_SIZE', label: '文件大小', defaultOrder: 'DESC' },
  CONTAINER: { value: 'CONTAINER', label: '文件格式', defaultOrder: 'ASC' },
  RANDOM: { value: 'RANDOM', label: '随机', defaultOrder: null },
  ALBUM: { value: 'ALBUM', label: '专辑', defaultOrder: 'ASC' },
  ALBUM_ARTIST: { value: 'ALBUM_ARTIST', label: '专辑艺人', defaultOrder: 'ASC' },
  NAME: { value: 'NAME', label: '曲目名称', defaultOrder: 'ASC' },
  ARTIST: { value: 'ARTIST', label: '艺术家', defaultOrder: 'ASC' },
  COMPOSER: { value: 'COMPOSER', label: '作曲家', defaultOrder: 'ASC' },
  DIRECTOR: { value: 'DIRECTOR', label: '导演', defaultOrder: 'ASC' },
  TOTAL_BITRATE: { value: 'TOTAL_BITRATE', label: '比特率', defaultOrder: 'DESC' },
  RESOLUTION: { value: 'RESOLUTION', label: '分辨率', defaultOrder: 'DESC' },
  FRAMERATE: { value: 'FRAMERATE', label: '帧率', defaultOrder: 'DESC' },
  VIDEO_CODEC: { value: 'VIDEO_CODEC', label: '视频编解码器', defaultOrder: 'ASC' },
  SERIES_SORT_NAME: { value: 'SERIES_SORT_NAME', label: '剧集名', defaultOrder: 'ASC' },
  LAST_CONTENT_ADDED: {
    value: 'LAST_CONTENT_ADDED',
    label: '上次添加内容日期',
    defaultOrder: 'DESC',
  },
  LAST_CONTENT_PREMIERE_DATE: {
    value: 'LAST_CONTENT_PREMIERE_DATE',
    label: '上次发布集日期',
    defaultOrder: 'DESC',
  },
  SERIES_DATE_PLAYED: { value: 'SERIES_DATE_PLAYED', label: '剧集播放日期', defaultOrder: 'DESC' },
  NUMBER: { value: 'NUMBER', label: '编号', defaultOrder: 'ASC' },
  CHANNEL_NUMBER: { value: 'CHANNEL_NUMBER', label: '频道编号', defaultOrder: 'ASC' },
  START_DATE: { value: 'START_DATE', label: '播出日期', defaultOrder: 'ASC' },
  DATE_MODIFIED: { value: 'DATE_MODIFIED', label: '修改日期', defaultOrder: 'DESC' },
  PRODUCTION_YEAR: { value: 'PRODUCTION_YEAR', label: '年份', defaultOrder: 'DESC' },
  IS_FAVORITE: { value: 'IS_FAVORITE', label: '收藏', defaultOrder: 'ASC' },
};

/** 排序项 → 服务器 SortBy 字段链；null = 该端不提供（设置页隐藏） */
export const SORT_CHAIN: Record<ServerFlavor, Record<SortByEnum, readonly string[] | null>> = {
  EMBY: {
    SORT_NAME: ['SortName'],
    DATE_CREATED: ['DateCreated', 'SortName'],
    PREMIERE_DATE: ['ProductionYear', 'PremiereDate', 'SortName'],
    COMMUNITY_RATING: ['CommunityRating', 'SortName'],
    CRITIC_RATING: ['CriticRating', 'SortName'],
    OFFICIAL_RATING: ['OfficialRating', 'SortName'],
    PLAY_COUNT: ['PlayCount', 'SortName'],
    DATE_PLAYED: ['DatePlayed', 'SortName'],
    FILENAME: ['IsFolder', 'Filename'],
    RUNTIME: ['Runtime', 'SortName'],
    FILE_SIZE: ['Size', 'SortName'],
    CONTAINER: ['Container', 'SortName'],
    RANDOM: ['Random'],
    ALBUM: ['Album', 'ParentIndexNumber', 'IndexNumber'],
    ALBUM_ARTIST: ['AlbumArtist', 'Album', 'ParentIndexNumber', 'IndexNumber', 'SortName'],
    NAME: ['SortName'],
    ARTIST: ['Artist', 'Album', 'ParentIndexNumber', 'IndexNumber', 'SortName'],
    COMPOSER: ['Composer', 'Album', 'ParentIndexNumber', 'IndexNumber', 'SortName'],
    DIRECTOR: ['Director', 'SortName'],
    TOTAL_BITRATE: ['TotalBitrate', 'SortName'],
    RESOLUTION: ['Resolution', 'SortName'],
    FRAMERATE: ['Framerate', 'SortName'],
    VIDEO_CODEC: ['VideoCodec', 'SortName'],
    SERIES_SORT_NAME: ['SeriesSortName', 'ParentIndexNumber', 'IndexNumber', 'SortName'],
    LAST_CONTENT_ADDED: ['DateLastContentAdded', 'SortName'],
    LAST_CONTENT_PREMIERE_DATE: ['LastContentPremiereDate', 'SortName'],
    SERIES_DATE_PLAYED: ['SeriesDatePlayed', 'SortName'],
    NUMBER: ['ParentIndexNumber', 'IndexNumber', 'SortName'],
    CHANNEL_NUMBER: ['ChannelNumber', 'SortName'],
    START_DATE: ['StartDate'],
    DATE_MODIFIED: ['DateModified', 'SortName'],
    PRODUCTION_YEAR: ['ProductionYear', 'SortName'],
    IS_FAVORITE: ['IsFavorite', 'DatePlayed', 'ChannelNumber', 'SortName'],
  },
  JELLYFIN: {
    SORT_NAME: ['SortName'],
    DATE_CREATED: ['DateCreated', 'SortName'],
    PREMIERE_DATE: ['ProductionYear', 'PremiereDate', 'SortName'],
    COMMUNITY_RATING: ['CommunityRating', 'SortName'],
    CRITIC_RATING: ['CriticRating', 'SortName'],
    OFFICIAL_RATING: ['OfficialRating', 'SortName'],
    PLAY_COUNT: ['PlayCount', 'SortName'],
    DATE_PLAYED: ['DatePlayed', 'SortName'],
    FILENAME: null,
    RUNTIME: ['Runtime', 'SortName'],
    FILE_SIZE: null,
    CONTAINER: null,
    RANDOM: ['Random'],
    ALBUM: ['Album', 'AlbumArtist', 'SortName'],
    ALBUM_ARTIST: ['AlbumArtist', 'SortName'],
    NAME: ['Name'],
    ARTIST: ['Artist', 'Album', 'SortName'],
    COMPOSER: null,
    DIRECTOR: null,
    TOTAL_BITRATE: null,
    RESOLUTION: null,
    FRAMERATE: null,
    VIDEO_CODEC: null,
    SERIES_SORT_NAME: ['SeriesSortName'],
    LAST_CONTENT_ADDED: ['DateLastContentAdded', 'SortName'],
    LAST_CONTENT_PREMIERE_DATE: null,
    SERIES_DATE_PLAYED: ['SeriesDatePlayed', 'SortName'],
    NUMBER: ['IndexNumber', 'SortName'],
    CHANNEL_NUMBER: null,
    START_DATE: ['StartDate'],
    DATE_MODIFIED: null,
    PRODUCTION_YEAR: null,
    IS_FAVORITE: ['IsFavoriteOrLiked', 'SortName'],
  },
};

/** 排序集合（文档中同一条目类型的菜单字段；defaultChecked 为现有字段） */
export type SortSetId =
  | 'videoFull'
  | 'musicVideo'
  | 'series'
  | 'episode'
  | 'audio'
  | 'album'
  | 'artist'
  | 'photo'
  | 'book'
  | 'game'
  | 'collection'
  | 'playlist'
  | 'folder'
  | 'channel'
  | 'program'
  | 'recording'
  | 'timer';

export interface SortSetSpec {
  readonly available: readonly SortByEnum[];
  readonly defaultChecked: readonly SortByEnum[];
}

const valuesOf = (optionList: readonly SortOption[]): SortByEnum[] =>
  optionList.map((option) => option.value);

const VIDEO_DEFAULT = valuesOf(SORT_OPTIONS);
const AUDIO_DEFAULT = valuesOf(AUDIO_SORT_OPTIONS);
const ARTIST_DEFAULT = valuesOf(ARTIST_SORT_OPTIONS);
const BOOK_DEFAULT = valuesOf(BOOK_SORT_OPTIONS);
const PHOTO_DEFAULT = valuesOf(PHOTO_SORT_OPTIONS);
const FOLDER_DEFAULT = valuesOf(FOLDER_SORT_OPTIONS);

const VIDEO_FULL_AVAILABLE: readonly SortByEnum[] = [
  'SORT_NAME',
  'DATE_CREATED',
  'PREMIERE_DATE',
  'COMMUNITY_RATING',
  'CRITIC_RATING',
  'OFFICIAL_RATING',
  'PLAY_COUNT',
  'DATE_PLAYED',
  'FILENAME',
  'RUNTIME',
  'FILE_SIZE',
  'CONTAINER',
  'RANDOM',
  'DIRECTOR',
  'TOTAL_BITRATE',
  'RESOLUTION',
  'FRAMERATE',
  'VIDEO_CODEC',
  'PRODUCTION_YEAR',
];

export const SORT_SETS: Record<SortSetId, SortSetSpec> = {
  videoFull: {
    available: VIDEO_FULL_AVAILABLE,
    defaultChecked: VIDEO_DEFAULT,
  },
  episode: {
    available: [
      ...VIDEO_FULL_AVAILABLE,
      'SERIES_SORT_NAME',
      'NUMBER',
    ],
    defaultChecked: VIDEO_DEFAULT,
  },
  musicVideo: {
    available: [
      ...VIDEO_FULL_AVAILABLE,
      'ALBUM',
      'ALBUM_ARTIST',
      'ARTIST',
      'COMPOSER',
      'NUMBER',
    ],
    defaultChecked: VIDEO_DEFAULT,
  },
  series: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'PLAY_COUNT',
      'DATE_PLAYED',
      'DIRECTOR',
      'RUNTIME',
      'RANDOM',
      'SERIES_DATE_PLAYED',
      'LAST_CONTENT_ADDED',
      'LAST_CONTENT_PREMIERE_DATE',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: [
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'PLAY_COUNT',
      'DATE_PLAYED',
      'RUNTIME',
      'RANDOM',
    ],
  },
  audio: {
    available: [
      'SORT_NAME',
      'NAME',
      'ALBUM',
      'ALBUM_ARTIST',
      'ARTIST',
      'DATE_CREATED',
      'DATE_PLAYED',
      'PLAY_COUNT',
      'PREMIERE_DATE',
      'FILENAME',
      'RUNTIME',
      'FILE_SIZE',
      'CONTAINER',
      'OFFICIAL_RATING',
      'COMMUNITY_RATING',
      'RANDOM',
      'COMPOSER',
      'TOTAL_BITRATE',
      'NUMBER',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: AUDIO_DEFAULT,
  },
  album: {
    available: [
      'SORT_NAME',
      'ALBUM_ARTIST',
      'ARTIST',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'COMPOSER',
      'DATE_CREATED',
      'LAST_CONTENT_ADDED',
      'OFFICIAL_RATING',
      'RANDOM',
      'PREMIERE_DATE',
      'RUNTIME',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: [
      'SORT_NAME',
      'ALBUM_ARTIST',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'RANDOM',
    ],
  },
  artist: {
    available: ['SORT_NAME', 'DATE_CREATED', 'COMMUNITY_RATING', 'RANDOM'],
    defaultChecked: ARTIST_DEFAULT,
  },
  photo: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'FILENAME',
      'CONTAINER',
      'RESOLUTION',
      'FILE_SIZE',
      'RANDOM',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: PHOTO_DEFAULT,
  },
  book: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'DATE_PLAYED',
      'PLAY_COUNT',
      'PREMIERE_DATE',
      'FILENAME',
      'FILE_SIZE',
      'CONTAINER',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'RANDOM',
      'NUMBER',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: BOOK_DEFAULT,
  },
  game: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'DATE_PLAYED',
      'PLAY_COUNT',
      'PREMIERE_DATE',
      'FILENAME',
      'FILE_SIZE',
      'CONTAINER',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'RANDOM',
      'NUMBER',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: [
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'PLAY_COUNT',
      'RANDOM',
    ],
  },
  collection: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'LAST_CONTENT_ADDED',
      'RANDOM',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: ['SORT_NAME', 'DATE_CREATED', 'COMMUNITY_RATING', 'RANDOM'],
  },
  playlist: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'DATE_MODIFIED',
      'FILENAME',
      'LAST_CONTENT_ADDED',
      'OFFICIAL_RATING',
      'RUNTIME',
      'RANDOM',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: ['SORT_NAME', 'DATE_CREATED', 'DATE_MODIFIED', 'RANDOM'],
  },
  folder: {
    available: [
      'SORT_NAME',
      'DATE_CREATED',
      'DATE_PLAYED',
      'FILENAME',
      'OFFICIAL_RATING',
      'PLAY_COUNT',
      'PREMIERE_DATE',
      'RUNTIME',
      'RANDOM',
      'PRODUCTION_YEAR',
    ],
    defaultChecked: FOLDER_DEFAULT,
  },
  channel: {
    available: [
      'SORT_NAME',
      'CHANNEL_NUMBER',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'DATE_PLAYED',
      'IS_FAVORITE',
      'OFFICIAL_RATING',
      'PLAY_COUNT',
      'RESOLUTION',
      'RANDOM',
    ],
    defaultChecked: ['SORT_NAME', 'CHANNEL_NUMBER', 'RANDOM'],
  },
  program: {
    available: [
      'START_DATE',
      'SORT_NAME',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'PREMIERE_DATE',
      'RESOLUTION',
    ],
    defaultChecked: ['START_DATE', 'SORT_NAME'],
  },
  recording: {
    available: ['DATE_CREATED', 'SORT_NAME', 'START_DATE', 'RUNTIME', 'RANDOM'],
    defaultChecked: ['DATE_CREATED', 'SORT_NAME', 'RANDOM'],
  },
  timer: {
    available: ['START_DATE', 'SORT_NAME', 'DATE_CREATED'],
    defaultChecked: ['START_DATE', 'SORT_NAME'],
  },
};

/** 排序集合 → SortOption 列表（保持传入顺序） */
export function sortOptionListOf(valueList: readonly SortByEnum[]): readonly SortOption[] {
  return valueList.map((value) => SORT_OPTION_META[value]);
}
