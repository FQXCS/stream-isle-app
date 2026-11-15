/**
 * 库页 Tab 目录（docs/feature/Emby与Jellyfin内容类型排序与筛选.md §1.1/§2.3 + §4 已看/未看）：
 * 设置页只渲染这里存在的 Tab；库页按 flavor + 用户覆盖解析后渲染。
 * 未实现的官方项（作曲家/作者/指南）不进入目录。
 */
import type {
  ItemFilterEnum,
  LibraryTypeEnum,
  MediaItemTypeEnum,
  ServerFlavor,
} from '@/adapter/model';
import type { MessageKey } from '@/i18n/messages/zh';
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
  | 'playlistGrid'
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
  readonly labelKey: MessageKey;
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

export const LIBRARY_TYPE_LABEL_KEYS: Record<LibraryTypeEnum, MessageKey> = {
  MOVIE: 'libraryType.movie',
  TVSHOW: 'libraryType.tvshow',
  MUSIC: 'libraryType.music',
  AUDIOBOOK: 'libraryType.audiobook',
  MUSICVIDEO: 'libraryType.musicVideo',
  PHOTO: 'libraryType.photo',
  BOOK: 'libraryType.book',
  BOXSET: 'libraryType.boxset',
  PLAYLIST: 'libraryType.playlist',
  GAME: 'libraryType.game',
  LIVETV: 'libraryType.liveTv',
  CHANNEL: 'libraryType.channel',
  TRAILER: 'libraryType.trailer',
  MIXED: 'libraryType.mixed',
};

const BOTH: readonly ServerFlavor[] = ['JELLYFIN', 'EMBY'];
const EMBY_ONLY: readonly ServerFlavor[] = ['EMBY'];
const JELLYFIN_ONLY: readonly ServerFlavor[] = ['JELLYFIN'];

interface BaseTabParams {
  id: TabId;
  labelKey: MessageKey;
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
    labelKey: params.labelKey,
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
    labelKey: params.labelKey,
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
    labelKey: params.labelKey,
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
    labelKey: params.labelKey,
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
    itemsTab({ id: 'all', labelKey: 'tab.movies', kinds: ['Movie'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', labelKey: 'tab.favorites', kinds: ['Movie'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Movie'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Movie'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['Movie'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'trailer', labelKey: 'tab.trailers', kinds: ['Trailer'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    itemsTab({ id: 'playlist', labelKey: 'tab.playlists', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['Movie'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Movie'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'photo', labelKey: 'tab.photos', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none' }),
    itemsTab({ id: 'artist', labelKey: 'tab.artists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'albumArtist', labelKey: 'tab.albumArtists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
  ],

  TVSHOW: [
    itemsTab({ id: 'all', labelKey: 'tab.series', kinds: ['Series'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', labelKey: 'tab.favorites', kinds: ['Series'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Series'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'series' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Series'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['Series'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'trailer', labelKey: 'tab.trailers', kinds: ['Trailer'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'episode', labelKey: 'tab.episodes', kinds: ['Episode'], renderer: 'posterWall', sortSet: 'episode' }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'studio', labelKey: 'tab.studios', special: 'studios', kinds: ['Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  MIXED: [
    itemsTab({ id: 'all', labelKey: 'tab.all', kinds: ['Movie', 'Series'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'movie', labelKey: 'tab.movie', kinds: ['Movie'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true }),
    itemsTab({ id: 'series', labelKey: 'tab.series', kinds: ['Series'], renderer: 'posterWall', sortSet: 'series', defaultEnabled: true }),
    itemsTab({ id: 'favorite', labelKey: 'tab.favorites', kinds: ['Movie', 'Series'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Movie', 'Series'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Movie', 'Series'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['Movie', 'Series'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    itemsTab({ id: 'playlist', labelKey: 'tab.playlists', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['Movie', 'Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Movie', 'Series'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'photo', labelKey: 'tab.photos', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none' }),
  ],

  MUSIC: [
    songsTab({ id: 'song', labelKey: 'tab.songs', renderer: 'songList', sortSet: 'audio', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'artist', labelKey: 'tab.artists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist', defaultEnabled: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'album', labelKey: 'tab.albums', kinds: ['MusicAlbum'], renderer: 'albumGrid', sortSet: 'album', tap: 'album' }),
    itemsTab({ id: 'albumArtist', labelKey: 'tab.albumArtists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['MusicAlbum'], renderer: 'posterWall', sortSet: 'none', tap: 'album' }),
    // 音乐个人歌单（docs/doing/音乐个人歌单.md §5.6.5）：专辑同款网格、默认启用；
    // 文案用「歌单」（tab.songlists，仅音乐库段更换，其余库类型保留「播放列表」）
    itemsTab({ id: 'playlist', labelKey: 'tab.songlists', kinds: ['Playlist'], renderer: 'playlistGrid', sortSet: 'playlist', tap: 'audioPlaylist', defaultEnabled: true }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['MusicAlbum', 'Audio'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['MusicAlbum', 'Audio'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    songsTab({ id: 'played', labelKey: 'tab.played', filters: ['IsPlayed'], renderer: 'songList', sortSet: 'audio', flavors: EMBY_ONLY }),
    songsTab({ id: 'unplayed', labelKey: 'tab.unplayed', filters: ['IsUnplayed'], renderer: 'songList', sortSet: 'audio', flavors: EMBY_ONLY }),
  ],

  AUDIOBOOK: [
    itemsTab({ id: 'album', labelKey: 'tab.audiobooks', kinds: ['MusicAlbum'], renderer: 'albumGrid', sortSet: 'album', tap: 'album', defaultEnabled: true, defaultSelected: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'artist', labelKey: 'tab.authors', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist', defaultEnabled: true, flavors: EMBY_ONLY }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['MusicAlbum'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'album', tap: 'album', flavors: EMBY_ONLY }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['MusicAlbum'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'album', tap: 'album', flavors: EMBY_ONLY }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['MusicAlbum'], renderer: 'posterWall', sortSet: 'none', tap: 'album', flavors: EMBY_ONLY }),
    itemsTab({ id: 'playlist', labelKey: 'tab.playlists', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'audioPlaylist', flavors: EMBY_ONLY }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['MusicAlbum'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['MusicAlbum'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
  ],

  MUSICVIDEO: [
    itemsTab({ id: 'video', labelKey: 'tab.videos', kinds: ['MusicVideo'], renderer: 'posterWall', sortSet: 'musicVideo', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['MusicVideo'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'musicVideo' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['MusicVideo'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'musicVideo' }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['MusicVideo'], renderer: 'posterWall', sortSet: 'none', tap: 'item' }),
    itemsTab({ id: 'photo', labelKey: 'tab.photos', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none' }),
    itemsTab({ id: 'albumArtist', labelKey: 'tab.albumArtists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'artist', labelKey: 'tab.artists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'playlist', labelKey: 'tab.playlists', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['MusicVideo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['MusicVideo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  PHOTO: [
    itemsTab({ id: 'video', labelKey: 'tab.videos', kinds: ['Video'], renderer: 'videoGrid', sortSet: 'videoFull', defaultEnabled: true }),
    itemsTab({ id: 'photo', labelKey: 'tab.images', kinds: ['Photo'], renderer: 'photoGrid', sortSet: 'photo', tap: 'none', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'photoAlbum', labelKey: 'tab.photoAlbums', kinds: ['PhotoAlbum'], renderer: 'photoAlbumGrid', sortSet: 'photo', tap: 'photoAlbum' }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Video'], filters: ['IsPlayed'], renderer: 'videoGrid', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Video'], filters: ['IsUnplayed'], renderer: 'videoGrid', sortSet: 'videoFull' }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    itemsTab({ id: 'playlist', labelKey: 'tab.playlists', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['Video', 'Photo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Video', 'Photo'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'artist', labelKey: 'tab.artists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
    itemsTab({ id: 'albumArtist', labelKey: 'tab.albumArtists', kinds: ['MusicArtist'], renderer: 'artistList', sortSet: 'artist', tap: 'artist' }),
  ],

  BOOK: [
    itemsTab({ id: 'all', labelKey: 'tab.books', kinds: ['Book'], renderer: 'posterWall', sortSet: 'book', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'favorite', labelKey: 'tab.favorites', kinds: ['Book'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'book' }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Book'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'book' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Book'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'book' }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['Book'], renderer: 'posterWall', sortSet: 'none', tap: 'item', flavors: JELLYFIN_ONLY }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['Book'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Book'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  BOXSET: [
    itemsTab({ id: 'all', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', labelKey: 'tab.favorites', kinds: ['BoxSet'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection' }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['BoxSet'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['BoxSet'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', flavors: JELLYFIN_ONLY }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['BoxSet'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', flavors: JELLYFIN_ONLY }),
  ],

  PLAYLIST: [
    itemsTab({ id: 'all', labelKey: 'tab.playlists', kinds: ['Playlist'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist', defaultEnabled: true, defaultSelected: true }),
    itemsTab({ id: 'favorite', labelKey: 'tab.favorites', kinds: ['Playlist'], filters: ['IsFavorite'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist' }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Playlist'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist', flavors: JELLYFIN_ONLY }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Playlist'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'playlist', tap: 'mediaPlaylist', flavors: JELLYFIN_ONLY }),
  ],

  GAME: [
    itemsTab({ id: 'game', labelKey: 'tab.games', kinds: ['Game'], renderer: 'posterWall', sortSet: 'game', defaultEnabled: true, defaultSelected: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'gameSystem', labelKey: 'tab.systems', kinds: ['GameSystem'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', defaultEnabled: true, flavors: EMBY_ONLY }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true, flavors: EMBY_ONLY }),
    itemsTab({ id: 'collection', labelKey: 'tab.collections', kinds: ['BoxSet'], renderer: 'posterWall', sortSet: 'collection', tap: 'collection', flavors: EMBY_ONLY }),
    specialTab({ id: 'genre', labelKey: 'tab.genres', special: 'genres', kinds: ['Game'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Game'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList', flavors: EMBY_ONLY }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Game'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'game', flavors: EMBY_ONLY }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Game'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'game', flavors: EMBY_ONLY }),
    specialTab({ id: 'recommend', labelKey: 'tab.recommended', special: 'suggestions', kinds: ['Game'], renderer: 'posterWall', sortSet: 'none', tap: 'item', flavors: EMBY_ONLY }),
  ],

  LIVETV: [
    specialTab({ id: 'liveProgram', labelKey: 'tab.programs', special: 'livePrograms', renderer: 'programList', sortSet: 'program', tap: 'playChannel', defaultEnabled: true, defaultSelected: true }),
    specialTab({ id: 'liveChannel', labelKey: 'tab.channels', special: 'liveChannels', renderer: 'channelList', sortSet: 'channel', tap: 'playChannel', defaultEnabled: true }),
    specialTab({ id: 'liveRecording', labelKey: 'tab.recordings', special: 'liveRecordings', renderer: 'recordingList', sortSet: 'recording', tap: 'item', defaultEnabled: true }),
    specialTab({ id: 'liveTimer', labelKey: 'tab.timers', special: 'liveTimers', renderer: 'timerList', sortSet: 'timer', defaultEnabled: true }),
    specialTab({ id: 'liveSeriesTimer', labelKey: 'tab.series', special: 'liveSeriesTimers', renderer: 'timerList', sortSet: 'timer' }),
    specialTab({ id: 'tag', labelKey: 'tab.tags', special: 'tags', kinds: ['Program'], renderer: 'entityList', sortSet: 'none', tap: 'filteredList' }),
  ],

  TRAILER: [
    itemsTab({ id: 'all', labelKey: 'tab.trailers', kinds: ['Trailer'], renderer: 'posterWall', sortSet: 'videoFull', defaultEnabled: true, defaultSelected: true }),
    folderTab({ id: 'folder', labelKey: 'tab.folders', sortSet: 'folder', defaultEnabled: true }),
    itemsTab({ id: 'played', labelKey: 'tab.played', kinds: ['Trailer'], filters: ['IsPlayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
    itemsTab({ id: 'unplayed', labelKey: 'tab.unplayed', kinds: ['Trailer'], filters: ['IsUnplayed'], renderer: 'posterWall', sortSet: 'videoFull' }),
  ],

  CHANNEL: [
    specialTab({ id: 'channel', labelKey: 'tab.channels', special: 'pluginChannels', renderer: 'channelList', sortSet: 'none', tap: 'filteredList', defaultEnabled: true, defaultSelected: true, flavors: EMBY_ONLY }),
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
