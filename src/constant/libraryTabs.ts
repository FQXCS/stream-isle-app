/**
 * 库页 Tab 目录（docs/09 §1.1/§2.3 + §4 已看/未看）：
 * 设置页只渲染这里存在的 Tab；库页按 flavor + 用户覆盖解析后渲染。
 * 未实现的官方项（作曲家/作者/指南）不进入目录。
 */
import type {
  ItemFilterEnum,
  LibraryTypeEnum,
  MediaItemTypeEnum,
  ServerFlavor,
} from '@/adapter/model';
import type { SortSetId } from '@/constant/sortCatalog';

export type TabId = string;
export type TabSource = 'items' | 'songs' | 'folder' | 'special';
export type TabRenderer =
  | 'posterWall'
  | 'videoGrid'
  | 'photoGrid'
  | 'photoAlbumGrid'
  | 'folderBrowser'
  | 'songList'
  | 'artistList'
  | 'albumGrid'
  | 'entityList'
  | 'channelList'
  | 'programList'
  | 'recordingList'
  | 'timerList';
export type TabTap =
  | 'item'
  | 'album'
  | 'artist'
  | 'audioPlaylist'
  | 'mediaPlaylist'
  | 'collection'
  | 'filteredList'
  | 'photoAlbum'
  | 'playChannel'
  | 'none';
export type SpecialSource =
  | 'suggestions'
  | 'genres'
  | 'tags'
  | 'studios'
  | 'liveChannels'
  | 'livePrograms'
  | 'liveRecordings'
  | 'liveTimers'
  | 'liveSeriesTimers'
  | 'pluginChannels';

export interface TabSpec {
  readonly id: TabId;
  readonly label: string;
  readonly flavors: readonly ServerFlavor[];
  readonly source: TabSource;
  readonly special?: SpecialSource;
  readonly kinds?: readonly MediaItemTypeEnum[];
  readonly filters?: readonly ItemFilterEnum[];
  readonly recursive?: boolean;
  readonly renderer: TabRenderer;
  readonly tap: TabTap;
  readonly sortSet: SortSetId | 'none';
  readonly defaultEnabled: boolean;
  readonly defaultSelected?: boolean;
}

/** 每种库最多可启用的 Tab 数 */
export const MAX_LIBRARY_TABS = 5;

/** 设置页展示顺序 */
export const LIBRARY_TYPE_ORDER: readonly LibraryTypeEnum[] = [
  'MOVIE',
  'TVSHOW',
  'MUSIC',
  'AUDIOBOOK',
  'MUSICVIDEO',
  'PHOTO',
  'BOOK',
  'BOXSET',
  'PLAYLIST',
  'GAME',
  'LIVETV',
  'CHANNEL',
  'TRAILER',
  'MIXED',
];

export const LIBRARY_TYPE_LABELS: Record<LibraryTypeEnum, string> = {
  MOVIE: '电影',
  TVSHOW: '剧集',
  MUSIC: '音乐',
  AUDIOBOOK: '有声读物',
  MUSICVIDEO: '音乐视频',
  PHOTO: '家庭视频/照片',
  BOOK: '图书',
  BOXSET: '合集',
  PLAYLIST: '播放列表',
  GAME: '游戏',
  LIVETV: '直播电视',
  CHANNEL: '频道',
  TRAILER: '预告片',
  MIXED: '混合',
};

const BOTH: readonly ServerFlavor[] = ['JELLYFIN', 'EMBY'];
const EMBY_ONLY: readonly ServerFlavor[] = ['EMBY'];
const JELLYFIN_ONLY: readonly ServerFlavor[] = ['JELLYFIN'];

interface BaseTabParams {
  id: TabId;
  label: string;
  sortSet: SortSetId | 'none';
  defaultEnabled?: boolean;
  defaultSelected?: boolean;
  flavors?: readonly ServerFlavor[];
}

interface CommonTabParams extends BaseTabParams {
  renderer: TabRenderer;
}

interface ItemsTabParams extends CommonTabParams {
  kinds?: MediaItemTypeEnum[];
  filters?: ItemFilterEnum[];
  recursive?: boolean;
  tap?: TabTap;
}

function itemsTab(params: ItemsTabParams): TabSpec {
  return {
    id: params.id,
    label: params.label,
    flavors: params.flavors ?? BOTH,
    source: 'items',
    kinds: params.kinds,
    filters: params.filters,
    recursive: params.recursive,
    renderer: params.renderer,
    tap: params.tap ?? 'item',
    sortSet: params.sortSet,
    defaultEnabled: params.defaultEnabled ?? false,
    defaultSelected: params.defaultSelected,
  };
}

function songsTab(params: CommonTabParams & { filters?: ItemFilterEnum[] }): TabSpec {
  return {
    id: params.id,
    label: params.label,
    flavors: params.flavors ?? BOTH,
    source: 'songs',
    filters: params.filters,
    renderer: params.renderer,
    tap: 'none',
    sortSet: params.sortSet,
    defaultEnabled: params.defaultEnabled ?? false,
    defaultSelected: params.defaultSelected,
  };
}

function folderTab(params: BaseTabParams): TabSpec {
  return {
    id: params.id,
    label: params.label,
    flavors: params.flavors ?? BOTH,
    source: 'folder',
    renderer: 'folderBrowser',
    tap: 'none',
    sortSet: params.sortSet,
    defaultEnabled: params.defaultEnabled ?? false,
    defaultSelected: params.defaultSelected,
  };
}

function specialTab(
  params: CommonTabParams & {
    special: SpecialSource;
    kinds?: MediaItemTypeEnum[];
    tap?: TabTap;
  }
): TabSpec {
  return {
    id: params.id,
    label: params.label,
    flavors: params.flavors ?? BOTH,
    source: 'special',
    special: params.special,
    kinds: params.kinds,
    renderer: params.renderer,
    tap: params.tap ?? 'none',
    sortSet: params.sortSet,
    defaultEnabled: params.defaultEnabled ?? false,
    defaultSelected: params.defaultSelected,
  };
}

export const TAB_CATALOG: Record<LibraryTypeEnum, readonly TabSpec[]> = {
  MOVIE: [
    itemsTab({ id: 'all', label: '影片', kinds: ['Movie'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', label: '收藏', kinds: ['Movie'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Movie'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Movie'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['Movie'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'trailer', label: '预告片', kinds: ['Trailer'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    itemsTab({ id: 'playlist', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['Movie'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Movie'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'photo', label: '照片', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none' }),
    itemsTab({ id: 'artist', label: '艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'albumArtist', label: '专辑艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
  ],

  TVSHOW: [
    itemsTab({ id: 'all', label: '剧集', kinds: ['Series'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', label: '收藏', kinds: ['Series'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Series'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'series' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Series'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['Series'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'trailer', label: '预告', kinds: ['Trailer'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'episode', label: '集', kinds: ['Episode'], renderer: 'posterWall', sortSet: 'episode' }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'studio', label: '播出平台', special: 'studios', kinds: ['Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  MIXED: [
    itemsTab({ id: 'all', label: '全部', kinds: ['Movie', 'Series'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'movie', label: '电影', kinds: ['Movie'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true }),
    itemsTab({ id: 'series', label: '剧集', kinds: ['Series'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true }),
    itemsTab({ id: 'favorite', label: '收藏', kinds: ['Movie', 'Series'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Movie', 'Series'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Movie', 'Series'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['Movie', 'Series'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    itemsTab({ id: 'playlist', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['Movie', 'Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Movie', 'Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'photo', label: '照片', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none' }),
  ],

  MUSIC: [
    songsTab({ id: 'song', label: '歌曲', renderer: 'songList', sortSet: 'audio', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'artist', label: '艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist', defaultEnabled: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'album', label: '专辑', kinds: ['MusicAlbum'], renderer: 'albumGrid', sortSet: 'album', tap: 'album' }),
    itemsTab({ id: 'albumArtist', label: '专辑艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['MusicAlbum'], renderer: 'posterWall', sortSet: 'none', tap: 'album' }),
    itemsTab({ id: 'playlist', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'audioPlaylist' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['MusicAlbum', 'Audio'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['MusicAlbum', 'Audio'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    songsTab({ id: 'played', label: '已看', filters: ['IsPlayed'], renderer: 'songList', sortSet: 'audio', flavors: EMBY_ONLY }),
    songsTab({ id: 'unplayed', label: '未看', filters: ['IsUnplayed'], renderer: 'songList', sortSet: 'audio', flavors: EMBY_ONLY }),
  ],

  AUDIOBOOK: [
    itemsTab({ id: 'album', label: '有声读物', kinds: ['MusicAlbum'], renderer: 'albumGrid', sortSet: 'album', tap: 'album', defaultEnabled: true, defaultSelected: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'artist', label: '作者', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist', defaultEnabled: true, flavors: EMBY_ONLY }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'played', label: '已看', kinds: ['MusicAlbum'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'album', tap: 'album', flavors: EMBY_ONLY }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['MusicAlbum'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'album', tap: 'album', flavors: EMBY_ONLY }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['MusicAlbum'], renderer: 'posterWall', sortSet: 'none', tap: 'album', flavors: EMBY_ONLY }),
    itemsTab({ id: 'playlist', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'audioPlaylist', flavors: EMBY_ONLY }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['MusicAlbum'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['MusicAlbum'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
  ],

  MUSICVIDEO: [
    itemsTab({ id: 'video', label: '视频', kinds: ['MusicVideo'], renderer: 'posterWall', sortSet: 'musicVideo', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'played', label: '已看', kinds: ['MusicVideo'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'musicVideo' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['MusicVideo'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'musicVideo' }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['MusicVideo'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'photo', label: '照片', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none' }),
    itemsTab({ id: 'albumArtist', label: '专辑艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'artist', label: '艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'playlist', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['MusicVideo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['MusicVideo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  PHOTO: [
    itemsTab({ id: 'video', label: '视频', kinds: ['Video'], renderer: 'videoGrid', sortSet: 'videoFull', defaultEnabled: true }),
    itemsTab({ id: 'photo', label: '图片', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'photoAlbum', label: '相册', kinds: ['PhotoAlbum'], renderer: 'photoAlbumGrid', sortSet: 'photo', tap: 'photoAlbum' }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Video'], filters: ['IsPlayed'], renderer: 'videoGrid', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Video'], filters: ['IsUnplayed'], renderer: 'videoGrid', sortSet: 'videoFull' }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    itemsTab({ id: 'playlist', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['Video', 'Photo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Video', 'Photo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'artist', label: '艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'albumArtist', label: '专辑艺人', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
  ],

  BOOK: [
    itemsTab({ id: 'all', label: '书籍', kinds: ['Book'], renderer: 'posterWall', sortSet: 'book', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'favorite', label: '收藏', kinds: ['Book'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'book' }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Book'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'book' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Book'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'book' }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['Book'], renderer: 'posterWall', sortSet: 'none', tap: 'item', flavors: JELLYFIN_ONLY }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['Book'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Book'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  BOXSET: [
    itemsTab({ id: 'all', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', label: '收藏', kinds: ['BoxSet'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['BoxSet'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'played', label: '已看', kinds: ['BoxSet'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', flavors: JELLYFIN_ONLY }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['BoxSet'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', flavors: JELLYFIN_ONLY }),
  ],

  PLAYLIST: [
    itemsTab({ id: 'all', label: '播放列表', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', label: '收藏', kinds: ['Playlist'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Playlist'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist', flavors: JELLYFIN_ONLY }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Playlist'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist', flavors: JELLYFIN_ONLY }),
  ],

  GAME: [
    itemsTab({ id: 'game', label: '游戏', kinds: ['Game'], renderer: 'posterWall', sortSet: 'game', defaultEnabled: true, defaultSelected: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'gameSystem', label: '系统', kinds: ['GameSystem'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', defaultEnabled: true, flavors: EMBY_ONLY }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'collection', label: '合集', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', flavors: EMBY_ONLY }),
    specialTab({ id: 'genre', label: '类型', special: 'genres', kinds: ['Game'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Game'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Game'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'game', flavors: EMBY_ONLY }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Game'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'game', flavors: EMBY_ONLY }),
    specialTab({ id: 'recommend', label: '推荐', special: 'suggestions', kinds: ['Game'], renderer: 'posterWall', sortSet: 'none', tap: 'item', flavors: EMBY_ONLY }),
  ],

  LIVETV: [
    specialTab({ id: 'liveProgram', label: '节目', special: 'livePrograms', renderer: 'programList', sortSet: 'program', tap: 'playChannel', defaultEnabled: true, defaultSelected: true }),
    specialTab({ id: 'liveChannel', label: '频道', special: 'liveChannels', renderer: 'channelList', sortSet: 'channel', tap: 'playChannel', defaultEnabled: true }),
    specialTab({ id: 'liveRecording', label: '录制内容', special: 'liveRecordings', renderer: 'recordingList', sortSet: 'recording', tap: 'item', defaultEnabled: true }),
    specialTab({ id: 'liveTimer', label: '计划', special: 'liveTimers', renderer: 'timerList', sortSet: 'timer', defaultEnabled: true }),
    specialTab({ id: 'liveSeriesTimer', label: '剧集', special: 'liveSeriesTimers', renderer: 'timerList', sortSet: 'timer' }),
    specialTab({ id: 'tag', label: '标签', special: 'tags', kinds: ['Program'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  TRAILER: [
    itemsTab({ id: 'all', label: '预告片', kinds: ['Trailer'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', label: '文件夹', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'played', label: '已看', kinds: ['Trailer'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', label: '未看', kinds: ['Trailer'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
  ],

  CHANNEL: [
    specialTab({ id: 'channel', label: '频道', special: 'pluginChannels', renderer: 'channelList', sortSet: 'none', tap: 'filteredList', defaultEnabled: true, defaultSelected: true, flavors: EMBY_ONLY }),
  ],
};

/** 某 flavor 可配置的库类型（目录中至少有 1 个可用 Tab） */
export function libraryTypesOfFlavor(flavor: ServerFlavor): readonly LibraryTypeEnum[] {
  return LIBRARY_TYPE_ORDER.filter((libraryType) =>
    TAB_CATALOG[libraryType].some((tab) => tab.flavors.includes(flavor))
  );
}

/** 某库类型在某 flavor 下可用的 Tab（保持目录顺序） */
export function tabsOfFlavor(
  libraryType: LibraryTypeEnum,
  flavor: ServerFlavor
): readonly TabSpec[] {
  return TAB_CATALOG[libraryType].filter((tab) => tab.flavors.includes(flavor));
}
