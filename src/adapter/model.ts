/**
 * 统一领域模型（M1 文档 §4.6.1；设计文档 §6.2）。
 * 客户端自有 TS 类型，不透传服务器 JSON；字段名以 M2–M6 已落地终态为准。
 * M1 消费：ServerInfo / AuthResult / MediaLibrary / MediaLibraryItem / ItemQuery / Paged<T>；
 * 其余为 M2+ 消费的先行定义。
 */
import type { DecoderCapabilities } from '@/adapter/DeviceProfileBuilder';

/** 服务器类型（UI 不感知，仅 adapter/账号层使用） */
export type ServerFlavor = 'JELLYFIN' | 'EMBY';

/** 库类型（库卡片图标/布局归并用；由 CollectionType 经 COLLECTION_TYPE_MAP 翻译） */
export type LibraryTypeEnum = 'MOVIE' | 'TVSHOW' | 'MUSIC' | 'PHOTO' | 'BOOK' | 'MIXED';

/** 条目类型（服务器 Item Type 直译，含 M5 扩展值，全集唯一） */
export type MediaItemTypeEnum =
  | 'Movie'
  | 'Series'
  | 'Season'
  | 'Episode'
  | 'Person' // M1/M2 使用
  | 'MusicAlbum'
  | 'MusicArtist'
  | 'Audio'
  | 'Playlist' // M5 音乐
  | 'PhotoAlbum'
  | 'Photo' // M5 照片
  | 'Video' // 家庭视频/照片混合库（homevideos）的视频条目
  | 'Book' // 图书库（books）条目，M7 起仅列表浏览不提供阅读器
  | 'Folder'; // 文件夹浏览（Items?Recursive=false 的子目录）

/**
 * 排序字段（服务器 SortBy 词表，客户端自有枚举，参数映射见 BaseAdapter）。
 * 库页排序菜单按参考稿补齐十三个字段（含文件大小/文件格式/随机）。
 */
export type SortByEnum =
  | 'SORT_NAME'
  | 'DATE_CREATED'
  | 'PREMIERE_DATE'
  | 'COMMUNITY_RATING'
  | 'CRITIC_RATING'
  | 'OFFICIAL_RATING'
  | 'PLAY_COUNT'
  | 'DATE_PLAYED'
  | 'FILENAME'
  | 'RUNTIME'
  | 'FILE_SIZE'
  | 'CONTAINER'
  | 'RANDOM';

/** 图片类型（与 URL 段同形 /Images/{type}，调用字面量直接兼容） */
export type ImageTypeEnum = 'Primary' | 'Backdrop' | 'Thumb' | 'Logo' | 'Banner' | 'Profile';

/** 播放方式（M5 增量 Universal：服务器在 universal 端点内部决定直连/转码，客户端不感知） */
export type PlayMethodEnum = 'DirectPlay' | 'Transcode' | 'Universal';

/** 循环模式（M5：客户端自有字面量类型；AudioService 内映射到 track-player REPEAT_MODE.Off/Track/Queue） */
export type RepeatModeEnum = 'off' | 'track' | 'queue';

/** 服务器信息（探测产出） */
export interface ServerInfo {
  flavor: ServerFlavor;
  /** normalizeAddress 后的完整地址 */
  baseUrl: string;
  /** 上游 Server.Id（探测响应 Id，缺省用登录响应 ServerId 补） */
  serverId: string;
  serverName: string;
  version: string;
  /** < 10.8 / < 4.7（§4.4 semver） */
  versionTooLow: boolean;
}

/** 登录结果 */
export interface AuthResult {
  userId: string;
  userName: string;
  token: string;
  serverId: string;
  /** 拼好的完整 URL */
  avatarUrl?: string;
}

/** 服务器 UserData 翻译（02/05 消费同名类型） */
export interface UserItemData {
  played: boolean;
  playCount: number;
  favorite: boolean;
  /** PlaybackPositionTicks 经 ticksToMs 换算 */
  playbackPositionMs: number;
  /** 非服务器字段直传：adapter 由 playbackPositionMs/runtimeMs 计算（0–100），无 runtimeMs 时不产出（02 口径） */
  playedPercentage?: number;
}

/** 海报墙/列表条目（统一模型核心） */
export interface MediaLibraryItem {
  id: string;
  type: MediaItemTypeEnum;
  name: string;
  /** adapter 翻译的副标题（年份 / 第 x 季 等） */
  subtext?: string;
  productionYear?: number;
  /** Primary 完整海报 URL（含 maxWidth=POSTER_MAX_WIDTH、quality=85，Jellyfin 含 tag） */
  posterImageUrl?: string;
  runtimeMs?: number;
  /** 子项数量（文件夹/相册的 Fields=ChildCount；无该字段时不产出） */
  childCount?: number;
  userData: UserItemData;
}

/** 媒体库（库列表卡片） */
export interface MediaLibrary {
  id: string;
  name: string;
  /** 服务器 CollectionType 原值存档备查；布局分发按 type 枚举（05 §4.12 口径） */
  collectionType?: string;
  /** 由 collectionType 经 COLLECTION_TYPE_MAP 翻译（缺省 MIXED） */
  type: LibraryTypeEnum;
  /** 数量口径见 §4.6.3 getLibraryItemCount */
  itemCount?: number;
  primaryImageUrl?: string;
}

/** 列表查询（海报墙/搜索统一入口） */
export interface ItemQuery {
  userId: string;
  /** 库 id；海报墙必传 */
  parentId?: string;
  /** → IncludeItemTypes 原值直传（MediaItemTypeEnum 即服务器 Item Type 词表） */
  kinds?: MediaItemTypeEnum[];
  /** M4 */
  searchTerm?: string;
  /** 默认 SORT_NAME */
  sortBy?: SortByEnum;
  sortOrder?: 'ASC' | 'DESC';
  /** 服务器查询参数 Filters 原值；不传即全部 */
  filters?: ('IsPlayed' | 'IsUnplayed' | 'IsFavorite')[];
  /** 是否递归（缺省 true=整库；文件夹浏览传 false，只列当前层子项与子目录） */
  recursive?: boolean;
  /** 服务端分页，步长 PAGE_SIZE=40 */
  startIndex: number;
  limit: number;
}

/** 分页结果（total ← TotalRecordCount） */
export interface Paged<T> {
  items: T[];
  total: number;
  startIndex: number;
}

// —— 以下为 M5 音乐/照片消费（05 文档 §4.2）——

/**
 * 歌曲条目——命名说明：设计 §6.2 统一模型清单中的 AudioTrack 与 SubtitleTrack 并列，
 * 是 MediaStreams 音轨语义（音轨切换，M3 已交付），与「歌曲条目」是两个概念；
 * 为避免 adapter/model.ts 同名两义，歌曲条目命名为 AudioItem。
 */
export interface AudioItem {
  id: string;
  name: string;
  /** AlbumArtist ?? Artists[0] */
  artistName?: string;
  albumId?: string;
  albumName?: string;
  /** 曲目号（服务器原生曲号字段，不依赖曲名序号前缀） */
  indexNumber?: number;
  /** RunTimeTicks → ms */
  runtimeMs?: number;
  /** 封面（条目 Primary，maxWidth=AUDIO_ARTWORK_MAX_WIDTH；通知栏 artwork 与迷你条共用） */
  coverImageUrl?: string;
}

/** 相册条目（相册网格行） */
export interface PhotoAlbumSummary extends MediaLibraryItem {
  /** 照片数量（Fields=ChildCount） */
  childCount: number;
}

/** 照片条目（网格与查看器共用；URL 由 adapter 按请求宽度预拼，UI 不感知拼接细节） */
export interface PhotoItem extends MediaLibraryItem {
  /** 原图宽（信息条展示） */
  width?: number;
  height?: number;
  /** 文件名：adapter 取服务器 Path 的 basename（含扩展名），Path 缺失回退 name；不透传完整服务器路径 */
  fileName?: string;
  /** DateCreated ?? PremiereDate → ms（信息条「拍摄日期」） */
  takenAtMs?: number;
  /** 网格缩略（maxWidth=格子尺寸，见 05 §4.6） */
  gridImageUrl: string;
  /** 查看器缩放图（maxWidth=屏幕宽×dpr，见设计文档 §7.6） */
  viewerImageUrl: string;
  /** 原图（查看原图/保存用，无缩放参数；仅显式动作加载，05 §4.6） */
  originalImageUrl: string;
}

/** 专辑/歌单详情（AlbumDetailScreen kind=album|playlist，05 §4.12） */
export interface AlbumDetailModel {
  id: string;
  kind: 'album' | 'playlist';
  name: string;
  /** 专辑艺人（歌单无） */
  artistName?: string;
  productionYear?: number;
  /** Primary，maxWidth=AUDIO_ARTWORK_MAX_WIDTH */
  coverImageUrl?: string;
  /** 曲目；歌单按服务端顺序（getPlaylistItems） */
  trackList: AudioItem[];
}

/** 艺术家详情（AlbumDetailScreen kind=artist），见设计文档 §7.5 */
export interface ArtistDetailModel {
  id: string;
  name: string;
  /** Primary，maxWidth=ALBUM_GRID_COVER_MAX_WIDTH */
  avatarImageUrl?: string;
  overview?: string;
  /** 其专辑网格 */
  albumList: MediaLibraryItem[];
  /** 热门歌曲（PlayCount 降序） */
  hotSongList: AudioItem[];
}

// —— 以下为 M2+ 消费，M1 仅定义（字段名以 02/03/04 已落地终态为准）——

/** 季条目（02 口径） */
export interface SeasonItem extends MediaLibraryItem {
  indexNumber: number;
}

/** 集条目（02 口径） */
export interface EpisodeItem extends MediaLibraryItem {
  seasonId: string;
  seriesId: string;
  indexNumber: number;
  /** getEpisodes 因此请求 Fields=Overview */
  runtimeMs?: number;
  overview?: string;
}

/** 人物引用（02 口径） */
export interface PersonRef {
  id: string;
  name: string;
  /** 饰演角色名 */
  role?: string;
  /** 服务器 Person.Type 小写化映射 */
  kind: 'Actor' | 'Director' | 'Writer' | 'Producer' | 'GuestStar';
  /** adapter 拼好的头像 URL（Primary, maxWidth=PERSON_HEAD_MAX_WIDTH） */
  headImageUrl?: string;
}

/** 详情（电影与剧集共用，02 口径） */
export interface MediaDetail {
  id: string;
  type: MediaItemTypeEnum;
  name: string;
  originalTitle?: string;
  overview?: string;
  productionYear?: number;
  officialRating?: string;
  communityRating?: number;
  /** Ticks → ms */
  runtimeMs?: number;
  /** List 结尾命名（仓库 VO 规范同源，全接口统一执行） */
  genreList: string[];
  taglineList?: string[];
  peopleList: PersonRef[];
  /** Primary, maxWidth=DETAIL_POSTER_MAX_WIDTH */
  posterImageUrl?: string;
  /** Backdrop, maxWidth=DETAIL_BACKDROP_MAX_WIDTH（无 Backdrop 回退 Primary） */
  heroImageUrl?: string;
  /** Logo, maxWidth=DETAIL_POSTER_MAX_WIDTH */
  logoImageUrl?: string;
  /** 服务器文件路径（Fields=Path；详情页「文件信息」卡消费，无权限时不下发） */
  path?: string;
  userData: UserItemData;
  mediaSourceList: MediaSource[];
  /** Episode/Season 用（集号/季号） */
  seriesId?: string;
  seasonId?: string;
  indexNumber?: number;
}

/** 视频流技术信息（详情页「音视频字幕信息」展示；字段缺失即不展示对应行） */
export interface VideoStreamInfo {
  index: number;
  title?: string;
  codec?: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  isInterlaced?: boolean;
  frameRate?: number;
  bitrateBps?: number;
  videoRange?: string;
  colorSpace?: string;
  bitDepth?: number;
  pixelFormat?: string;
  refFrames?: number;
}

/** 音频流技术信息（同上；详情页信息卡） */
export interface AudioStreamInfo {
  index: number;
  title?: string;
  codec?: string;
  profile?: string;
  channelLayout?: string;
  channels?: number;
  sampleRate?: number;
  bitrateBps?: number;
  isDefault?: boolean;
}

/** 字幕流技术信息（同上；详情页信息卡） */
export interface SubtitleStreamInfo {
  index: number;
  title?: string;
  language?: string;
  format?: string;
  isExternal?: boolean;
  isForced?: boolean;
  isDefault?: boolean;
}

/** 媒体源（PlaybackInfo 判定产物） */
export interface MediaSource {
  id: string;
  name: string;
  container: string;
  runtimeMs?: number;
  /** 服务器基于本次上报 DeviceProfile 的判定 */
  supportsDirectPlay: boolean;
  supportsTranscoding: boolean;
  /** 服务器返回的相对 URL，客户端只拼 baseUrl（设计文档 §6.1，不自行拼参数） */
  transcodingUrl?: string;
  /** M1 既有字段，M2 不消费；M6 离线下载依赖（下载空间校验） */
  sizeBytes?: number;
  /** 详情页音视频字幕信息卡（MediaStreams 翻译；缺省视为无该类型轨道） */
  videoStreamList?: VideoStreamInfo[];
  audioStreamList?: AudioStreamInfo[];
  subtitleStreamList?: SubtitleStreamInfo[];
}

/** 字幕轨（M3 增量 burnIn/vttUrl） */
export interface SubtitleTrack {
  streamIndex: number;
  language?: string;
  /** adapter 翻译的展示名：DisplayTitle || Title || Language || `字幕 ${streamIndex + 1}` */
  title?: string;
  format?: string;
  /** DeliveryMethod === "External" */
  isExternal: boolean;
  isForced?: boolean;
  isDefault?: boolean;
  /** M3：DeliveryMethod === "Encode"，服务器将字幕烧入画面（选择后重启会话） */
  burnIn: boolean;
  /** M3：仅外挂文本轨有；adapter 拼好的完整 URL（含 api_key，可直接喂播放器） */
  vttUrl?: string;
}

/** 音轨 */
export interface AudioTrack {
  streamIndex: number;
  language?: string;
  title?: string;
  codec?: string;
  channels?: number;
  isDefault?: boolean;
}

/** 播放决策产物（UI/播放器唯一消费形态；03 终态） */
export interface PlaybackSource {
  playSessionId: string;
  itemId: string;
  mediaSourceId: string;
  /** 直连 → /Videos/{id}/stream?static=true…；转码 → {base}{TranscodingUrl}（HLS） */
  playMethod: PlayMethodEnum;
  /** 完整可播 URL（含 api_key） */
  url: string;
  positionMsAtStart: number;
  runTimeMs?: number;
  /** M3 填充（MediaStreams 翻译） */
  subtitleList: SubtitleTrack[];
  audioList: AudioTrack[];
  /** M3：本次会话生效码率上限（直连 undefined） */
  maxBitrateBps?: number;
}

/** 一次播放会话 = PlaybackSource + 会话元数据（进入播放页后不可变，02 §4.2） */
export type PlaybackSession = PlaybackSource & {
  startedAtEpochMs: number;
  /** 播放页控制层标题「标题 · S1E2 集名」（02 §4.12 要求展示而 §4.2 模型缺此字段，加法修订由详情页拼好传入） */
  name?: string;
  /** M4 自动连播判定（04 §4.4）：当前条目类型（详情页传入；缺省不参与连播） */
  itemType?: MediaItemTypeEnum;
  /** M4 自动连播（04 §4.4）：Episode 时所属剧集 id（getNextUp 结果按此匹配下一集） */
  seriesId?: string;
  /**
   * M6 增量（06 文档 §4.2）：本地文件会话为 true（DownloadService.buildLocalSession 置位）；
   * PlayerScreen 据此做控制层降级（码率按钮隐藏、字幕仅本地内嵌轨）。以交叉类型扩展，不改 M2 既有定义。
   */
  local?: boolean;
};

// —— M6 增量（06 文档 §4.2）：Quick Connect / 观看历史 / 歌词 ——

/** Quick Connect 发起结果（服务器 QuickConnectResult 的翻译） */
export interface QuickConnectSession {
  /** 6 位授权码，展示给用户（已登录端输码用） */
  code: string;
  /** 客户端轮询与换 Token 凭据，不展示 */
  secret: string;
  /** 服务器名，可展示 */
  friendlyName?: string;
}

/** Quick Connect 轮询状态（服务器 QuickConnectResult 的翻译，仅取所需字段） */
export interface QuickConnectState {
  authenticated: boolean;
}

/** 观看历史查询参数 */
export interface HistoryQuery {
  startIndex: number;
  limit: number;
  /** 收录类型（设置页多选，默认 Movie,Episode,Video） */
  includeItemTypes: readonly MediaItemTypeEnum[];
}

/** 历史条目（/Users/{uid}/Items 翻译结果 + 观看时间） */
export interface HistoryEntry extends MediaLibraryItem {
  /** UserData.LastPlayedDate → ms */
  lastPlayedAtMs?: number;
  /** 集条目的所属剧集名（Episode DTO 默认携带，缺失联调补 Fields） */
  seriesName?: string;
  /** 季号 */
  parentIndexNumber?: number;
  /** 集号 */
  indexNumber?: number;
}

/** 歌词行（服务器 LyricDto.Lyrics[] 的翻译） */
export interface LyricLine {
  text: string;
  /** StartTick(Ticks) → ms（util/ticks）；纯文本歌词无此字段 */
  startMs?: number;
}

/** 搜索分组类型（04 口径：三分组） */
export type SearchGroupKind = 'MOVIE' | 'SERIES' | 'PERSON';

/** 搜索结果分组（04 落地版） */
export interface SearchResultGroup {
  kind: SearchGroupKind;
  itemList: MediaLibraryItem[];
}

/** resolvePlayback 入参（03 终态回写；M3 起 profileInputs 恢复必填消费） */
export interface ResolvePlaybackOpts {
  mediaSourceId?: string;
  /** 会话重启时传当前毫秒位置 */
  startPositionMs?: number;
  /** 缺省取码率档位表（M3 constant/bitrate.ts）；档位：自动 20M / 10M / 4M / 2M（设计文档 §8.2） */
  maxBitrateBps?: number;
  /** 转码场景指定服务器转哪条音轨（重启增强路径用） */
  audioStreamIndex?: number;
  /** 烧录字幕场景指定烧录轨；undefined = 不烧录（切回文本/关闭时显式传 undefined） */
  subtitleStreamIndex?: number;
  /** 由服务层组装后传入，adapter 保持纯函数（03 §4.4.2） */
  profileInputs: ProfileInputs;
}

/** DeviceProfile 输入（03 §4.3 终态；服务层由 settingsStore + mediaCaps 组装） */
export interface ProfileInputs {
  allowHevcDirectPlay: boolean;
  decoderCaps: DecoderCapabilities;
}

/** 解码能力结构唯一定义在 DeviceProfileBuilder（M3 完整版取代 M1 占位 Record），此处转出口 */
export type { DecoderCapabilities };

/** M2 上报入参：reportPlaying / reportProgress / reportStopped 三个方法名已区分事件（设计文档 §7.3/§8.1） */
export interface ReportArgs {
  itemId: string;
  playSessionId: string;
  mediaSourceId: string;
  /** adapter 内 msToTicks 换算，服务层只管毫秒 */
  positionMs: number;
  /** reportProgress 用 */
  isPaused?: boolean;
  /**
   * M5 增量改为可选：playMethod 为 "Universal" 时 adapter 上报 body 不含 PlayMethod 字段
   * （客户端不知道服务器实际选了直连还是转码，不谎报，05 文档 §4.2）
   */
  playMethod?: PlayMethodEnum;
}
