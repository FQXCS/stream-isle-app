/**
 * ServerAdapter 接口（M1 文档 §4.6.2；设计文档 §6.2；M4 收口全量落地）。
 * UI 不感知服务器类型：全部 Emby/Jellyfin 差异压进 adapter 实现。
 * M1 实现 probe / login / getUserViews / getLibraryItemCount / listItems / imageUrl；
 * M2 增详情/季集/人物/上报/已看，M3 增播放决策/字幕/停止转码，M4 增搜索/首页三区/收藏成对端点。
 */
import type {
  AuthResult,
  AudioItem,
  EntitySummary,
  EpisodeItem,
  HistoryEntry,
  HistoryQuery,
  ImageTypeEnum,
  ItemFilterEnum,
  ItemQuery,
  LyricLine,
  MediaDetail,
  MediaLibrary,
  MediaLibraryItem,
  MediaItemTypeEnum,
  Paged,
  PhotoAlbumSummary,
  PhotoItem,
  PlaybackSource,
  QuickConnectSession,
  QuickConnectState,
  ReportArgs,
  ResolvePlaybackOpts,
  SeasonItem,
  SearchResultGroup,
  ServerFlavor,
  ServerInfo,
  SortByEnum,
  UserConfiguration,
} from '@/adapter/model';

export interface ServerAdapter {
  readonly flavor: ServerFlavor;
  readonly baseUrl: string;

  /** GET /System/Info/Public（免 token，带设备认证头） */
  probe(): Promise<ServerInfo>;

  /** POST /Users/AuthenticateByName（两端同路径同 Pw 字段名） */
  login(username: string, password: string): Promise<AuthResult>;

  /** GET /Users/{uid}/Views；includeHidden=true 取回含隐藏库的全量列表（媒体管理页用） */
  getUserViews(userId: string, includeHidden?: boolean): Promise<MediaLibrary[]>;

  /** GET /Users/{uid} → Configuration（媒体管理读取 OrderedViews/MyMediaExcludes） */
  getUserConfiguration(userId: string): Promise<UserConfiguration>;

  /** POST /Users/{uid}/Configuration（全量回写，调用方先 GET 再改两字段） */
  updateUserConfiguration(userId: string, config: UserConfiguration): Promise<void>;

  /** M1：Limit=0 取 TotalRecordCount（数量口径与海报墙一致；collectionType 供口径判定，可选项） */
  getLibraryItemCount(userId: string, libraryId: string, collectionType?: string): Promise<number>;

  /** GET /Users/{uid}/Items（海报墙/列表统一入口） */
  listItems(query: ItemQuery): Promise<Paged<MediaLibraryItem>>;

  // —— 归并为 listItems 的具名封装（设计文档 §6.2），共享实现，M2 起由对应页面调用 ——

  getItemDetail(userId: string, itemId: string): Promise<MediaDetail>;

  getSeasons(userId: string, seriesId: string): Promise<SeasonItem[]>;

  /** 端点 /Shows/{seriesId}/Episodes 要求 seriesId 路径参数（M2 回写） */
  getEpisodes(userId: string, seriesId: string, seasonId: string): Promise<EpisodeItem[]>;

  /**
   * 下一集（GET /Shows/NextUp）：返回 EpisodeItem（含 seriesId）——M4 §4.4 自动连播
   * 需按当前剧集 seriesId 匹配下一集；首页三区按 MediaLibraryItem 基类字段消费不受影响。
   */
  getNextUp(userId: string): Promise<EpisodeItem[]>;

  /** 首页继续观看：类型由设置页多选（默认 Movie,Episode,Video） */
  getResume(userId: string, includeItemTypes: readonly MediaItemTypeEnum[]): Promise<MediaLibraryItem[]>;

  /**
   * 最新添加（首页「最近添加」行只收录近 LATEST_WINDOW_DAYS 天入库条目；
   * parentId 限定库；limit 缺省首页行长度，媒体库融合页每库行传 20）
   */
  getLatest(userId: string, parentId?: string, limit?: number): Promise<MediaLibraryItem[]>;

  /**
   * 指定条目类型的最新添加（媒体库融合页每库行）：类型与筛选来自该库默认 Tab
   * （见 resolveLibraryLatestQuery）；类型组合由 Tab 配置决定。
   * sinceIso 传入时只收录该时间之后入库的条目（首页最近添加时间窗使用）。
   */
  getLatestByTypes(
    userId: string,
    parentId: string | undefined,
    includeItemTypes: string,
    limit: number,
    filters?: readonly ItemFilterEnum[],
    sinceIso?: string
  ): Promise<MediaLibraryItem[]>;

  getSimilar(userId: string, itemId: string): Promise<MediaLibraryItem[]>;

  /** M2：人物出演作品（GET /Users/{uid}/Items?PersonIds=…，只含 Movie/Series，M2 §4.3） */
  getPersonFilmography(userId: string, personId: string): Promise<MediaLibraryItem[]>;

  /**
   * M4：搜索（M4 §4.3）——按类型并发三次 GET /Users/{userId}/Items（SearchTerm/IncludeItemTypes/
   * Recursive/Limit=SEARCH_GROUP_LIMIT，不传 SortBy），汇齐后组装分组、剔除空组。
   */
  search(userId: string, term: string): Promise<SearchResultGroup[]>;

  /** M3（设计文档 §8 流程） */
  resolvePlayback(userId: string, itemId: string, opts?: ResolvePlaybackOpts): Promise<PlaybackSource>;

  /** M3 外挂 vtt */
  buildSubtitleUrl(itemId: string, mediaSourceId: string, streamIndex: number): string;

  /** M2：Playing 事件 */
  reportPlaying(args: ReportArgs): Promise<void>;

  /** M2：Progress 事件（每 PROGRESS_REPORT_INTERVAL_MS 节流，§7.3） */
  reportProgress(args: ReportArgs): Promise<void>;

  /** M2：Stopped 事件（退出/播完/出错） */
  reportStopped(args: ReportArgs): Promise<void>;

  /** M4：POST /Users/{uid}/PlayedItems/{itemId} */
  markPlayed(userId: string, itemId: string): Promise<void>;

  /** M4：DELETE /Users/{uid}/PlayedItems/{itemId} */
  unmarkPlayed(userId: string, itemId: string): Promise<void>;

  /** M4：POST /Users/{uid}/FavoriteItems/{itemId} */
  markFavorite(userId: string, itemId: string): Promise<void>;

  /** M4：DELETE /Users/{uid}/FavoriteItems/{itemId} */
  unmarkFavorite(userId: string, itemId: string): Promise<void>;

  /** 收藏态查询（GET /Users/{uid}/Items/{itemId}?Fields=UserData，仅供迷你条收藏按钮） */
  getItemFavorite(userId: string, itemId: string): Promise<boolean>;

  /** 删除服务器条目（库页长按菜单；DELETE /Items/{itemId}，需该用户具备删除权限） */
  deleteItem(itemId: string): Promise<void>;

  /** M3（设计文档 §8.3） */
  stopTranscodingSession(playSessionId: string): Promise<void>;

  // —— M5：音频 universal 与音乐/照片浏览（M5 文档 §4.3；全部共享实现，双 Adapter 不新增覆写）——

  /**
   * 音频 universal 统一端点 URL（设计文档 §8.4）：直连时服务器 302 原流、否则实时转 AAC。
   * maxBitrateBps 缺省 = 音频固定上限 20Mbps（音频无分辨率档位；参数保留供调用方显式覆盖）。
   */
  buildAudioUniversalUrl(itemId: string, playSessionId: string, maxBitrateBps?: number): string;

  /**
   * Book 原文件下载 URL（M7）：{base}/Items/{itemId}/Download + api_key。
   * 下载/渲染组件不携带请求头，认证只能进 URL（与音频 universal 同款机制）。
   */
  buildBookFileUrl(itemId: string): string;

  /** 专辑区：ParentId={libraryId} + IncludeItemTypes=MusicAlbum，SortName 升序分页 */
  getMusicAlbums(userId: string, libraryId: string, page: number): Promise<Paged<MediaLibraryItem>>;

  /** 艺术家区：IncludeItemTypes=MusicArtist，头像 = Primary；排序由音乐库菜单传入 */
  getMusicArtists(
    userId: string,
    libraryId: string,
    page: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>>;

  /**
   * 歌单区：IncludeItemTypes=Playlist 全量查询，**不带 ParentId**——歌单常独立于音乐库
   * 存在（服务端全局条目），四区内查全量歌单（M5 文档 §4.3）。
   * 音乐个人歌单（docs/doing/音乐个人歌单.md §5.6.5）：sort 缺省 SortName 升序，
   * 由音乐库歌单 Tab 透传 sortSet: 'playlist' 的菜单状态。
   */
  getMusicPlaylists(
    userId: string,
    page: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>>;

  /** 全部歌曲区：IncludeItemTypes=Audio，服务端分页；排序由音乐库菜单传入 */
  getAllSongs(
    userId: string,
    libraryId: string,
    page: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' },
    filters?: readonly ('IsPlayed' | 'IsUnplayed' | 'IsFavorite')[]
  ): Promise<Paged<AudioItem>>;

  /** 专辑曲目（专辑数量级小，不翻页；曲序 = ParentIndexNumber,IndexNumber,SortName 多键排序） */
  getAlbumTracks(userId: string, albumId: string): Promise<AudioItem[]>;

  /** 艺术家的专辑网格（AlbumArtistIds 过滤） */
  getArtistAlbums(userId: string, artistId: string, page: number): Promise<Paged<MediaLibraryItem>>;

  /** 艺术家热门歌曲（PlayCount 降序，Limit=HOT_SONGS_LIMIT） */
  getArtistHotSongs(userId: string, artistId: string): Promise<AudioItem[]>;

  /** 歌单曲目（GET /Playlists/{id}/Items 专用端点，保证歌单自定义顺序） */
  getPlaylistItems(userId: string, playlistId: string): Promise<AudioItem[]>;

  // —— 音乐个人歌单（docs/doing/音乐个人歌单.md §5.4/§5.1；全部共享实现，双 Adapter 不新增覆写）——

  /**
   * 创建歌单（POST /Playlists，统一 query 形式）：归属当前账号（Jellyfin 生效 UserId，
   * Emby 忽略该参数按 token 归属，两端结果一致）；itemIds 可空 = 空歌单；
   * MediaType=Audio 固定声明音频类型。返回新歌单 id。
   */
  createPlaylist(userId: string, name: string, itemIds?: string[]): Promise<string>;

  /** 加入曲目（POST /Playlists/{playlistId}/Items）：itemIds 可传单曲/专辑 id（服务器自动展开），追加至末尾 */
  addToPlaylist(userId: string, playlistId: string, itemIds: string[]): Promise<void>;

  /**
   * 移除歌单条目（DELETE /Playlists/{playlistId}/Items）：entryIds 是歌单条目 id
   * （AudioItem.playlistEntryId ← 服务器 PlaylistItemId），**不是歌曲 item id**。
   * 双端均只消费 EntryIds，无 UserId 参数。
   */
  removeFromPlaylist(playlistId: string, entryIds: string[]): Promise<void>;

  /** 移动歌单条目（POST /Playlists/{playlistId}/Items/{entryId}/Move/{newIndex}，双端同构路径参数；newIndex 0-based） */
  movePlaylistItem(playlistId: string, entryId: string, newIndex: number): Promise<void>;

  /**
   * 重命名歌单：GET /Users/{uid}/Items/{itemId} 取原始 JSON → 仅改 Name →
   * POST /Items/{itemId} 原对象提交（读-改-写收敛在 adapter 内，防字段覆盖）。
   */
  renamePlaylistItem(userId: string, itemId: string, name: string): Promise<void>;

  /** 相册网格（封面 = 相册 Primary 服务器自动取首图；Fields=ChildCount 供数量） */
  getPhotoAlbums(userId: string, libraryId: string, page: number): Promise<Paged<PhotoAlbumSummary>>;

  /**
   * 照片分页；三个 URL 由 adapter 按 widths 预拼（grid/viewer/original），
   * fileName 取服务器 Path 的 basename（缺失回退 name），只透传文件名不透传完整路径。
   * parentId 为相册 id 或库 id（库 id + Recursive=true = 全部图片）；sort 缺省按名称升序。
   */
  getPhotos(
    userId: string,
    parentId: string,
    page: number,
    widths: { gridMaxWidth: number; viewerMaxWidth: number },
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<PhotoItem>>;

  // —— M8：库页 Tab 扩展（推荐/实体/LiveTV/插件频道/通用歌单）——

  /** GET /Users/{uid}/Suggestions（Jellyfin 可能 404，服务层回退最新添加） */
  getSuggestions(
    userId: string,
    parentId: string,
    kinds: readonly MediaItemTypeEnum[],
    limit: number
  ): Promise<MediaLibraryItem[]>;

  /** GET /Genres | /MusicGenres | /GameGenres（按 kinds 选择端点） */
  getGenres(
    userId: string,
    parentId: string,
    kinds: readonly MediaItemTypeEnum[],
    startIndex?: number,
    limit?: number
  ): Promise<Paged<EntitySummary>>;

  /** GET /Tags（Emby 返回 {Items}，Jellyfin 可能返回 string[]） */
  getTags(
    userId: string,
    parentId: string,
    startIndex?: number,
    limit?: number
  ): Promise<Paged<EntitySummary>>;

  /** GET /Studios */
  getStudios(
    userId: string,
    parentId: string,
    startIndex?: number,
    limit?: number
  ): Promise<Paged<EntitySummary>>;

  /** GET /LiveTv/Channels */
  getLiveTvChannels(
    userId: string,
    startIndex: number,
    limit: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>>;

  /** GET /LiveTv/Programs */
  getLiveTvPrograms(
    userId: string,
    startIndex: number,
    limit: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>>;

  /** GET /LiveTv/Recordings */
  getLiveTvRecordings(
    userId: string,
    startIndex: number,
    limit: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>>;

  /** GET /LiveTv/Timers（响应可能是数组或 {Items}） */
  getLiveTvTimers(userId: string): Promise<MediaLibraryItem[]>;

  /** GET /LiveTv/SeriesTimers（响应可能是数组或 {Items}） */
  getLiveTvSeriesTimers(userId: string): Promise<MediaLibraryItem[]>;

  /** GET /Channels（Emby 插件频道；Jellyfin 可能不存在） */
  getPluginChannels(userId: string): Promise<EntitySummary[]>;

  /** GET /Channels/{id}/Items */
  getPluginChannelItems(
    userId: string,
    channelId: string,
    startIndex: number,
    limit: number
  ): Promise<Paged<MediaLibraryItem>>;

  /** GET /Playlists/{id}/Items（通用条目翻译，供视频歌单详情） */
  getPlaylistEntries(userId: string, playlistId: string): Promise<MediaLibraryItem[]>;

  /**
   * 带 token 的完整图片 URL（expo-image 直接加载、不经 ApiClient）。
   * M5：maxWidth 改可选——缺省 = 原图（不带尺寸/质量参数，「查看原图」与保存用）。
   */
  imageUrl(itemId: string, type: ImageTypeEnum, maxWidth?: number): string;

  // —— M6 增量（M6 文档 §4.3.1；全部落 BaseAdapter 共享实现）——

  /**
   * Quick Connect 是否启用（GET /QuickConnect/Enabled，免认证）。
   * M6 §4.3.1：也可跳过此探测直接 initiate 以 401 判禁用（官方 SDK 视为可选步骤），
   * 本实现按文档主路径先行探测。
   */
  isQuickConnectEnabled(): Promise<boolean>;

  /** 发起 Quick Connect（POST /QuickConnect/Initiate，免认证；禁用 401 → QUICK_CONNECT_DISABLED） */
  initiateQuickConnect(): Promise<QuickConnectSession>;

  /** 轮询授权状态（GET /QuickConnect/Connect?secret=…，免认证；404 → QUICK_CONNECT_EXPIRED） */
  pollQuickConnect(secret: string): Promise<QuickConnectState>;

  /** 授权后换取 Token（POST /Users/AuthenticateWithQuickConnect，body { Secret }；返回与 M1 login 同构） */
  loginWithQuickConnect(secret: string): Promise<AuthResult>;

  /** 观看历史：已看条目按 DatePlayed 倒序分页（GET /Users/{uid}/Items） */
  getWatchHistory(userId: string, query: HistoryQuery): Promise<Paged<HistoryEntry>>;

  /** 歌词（GET /Audio/{itemId}/Lyrics）：404/无歌词 → null（Emby 端点未实证，优雅降级） */
  getLyrics(userId: string, itemId: string): Promise<LyricLine[] | null>;
}
