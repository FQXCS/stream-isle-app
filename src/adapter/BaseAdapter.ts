/**
 * ServerAdapter 共享基础实现（M1 文档 §4.6.3；设计文档 §6.2「共享逻辑放基础实现」）。
 * 持有 ApiClient 与 AdapterParams；差异点抽象为三个 protected 方法由子类覆写
 * （authHeaderName / tokenHeader / imageTagQuery，对齐设计文档 §6.1 差异表）。
 */
import { CLIENT_NAME, APP_VERSION } from '@/constant/app';
import {
  IMAGE_QUALITY,
  POSTER_MAX_WIDTH,
  AVATAR_MAX_WIDTH,
  DETAIL_BACKDROP_MAX_WIDTH,
  DETAIL_POSTER_MAX_WIDTH,
  PERSON_HEAD_MAX_WIDTH,
} from '@/constant/image';
import {
  AUDIO_ARTWORK_MAX_WIDTH,
  AUDIO_TRANSCODING_AUDIO_CODEC,
  AUDIO_TRANSCODING_CONTAINER,
  HOT_SONGS_LIMIT,
  UNIVERSAL_CONTAINER_LIST,
} from '@/constant/audio';
import {
  COLLECTION_TYPE_MAP,
  HOME_ROW_LIMIT,
  INCLUDE_ITEM_TYPES_BY_LIBRARY,
  LATEST_WINDOW_DAYS,
  PAGE_SIZE,
} from '@/constant/browse';
import { PHOTO_PAGE_SIZE } from '@/constant/photo';
import { PERSON_AVATAR_MAX_WIDTH, SEARCH_GROUP_LIMIT } from '@/constant/search';
import { PROBE_TIMEOUT_MS } from '@/constant/api';
import { MIN_EMBY_VERSION, MIN_JELLYFIN_VERSION } from '@/constant/server';
import { SIMILAR_LIMIT } from '@/constant/playback';
import { AUDIO_MAX_STREAMING_BITRATE_BPS } from '@/constant/bitrate';
import { DEFAULT_RESOLUTION_TIER } from '@/constant/resolution';
import { SORT_CHAIN } from '@/constant/sortCatalog';
import { apiClient, type ApiClient } from '@/infra/api/ApiClient';
import { AppError } from '@/infra/error';
import { getDeviceId } from '@/infra/deviceId';
import * as Device from 'expo-device';
import type {
  AudioItem,
  AudioStreamInfo,
  AudioTrack,
  AuthResult,
  EntitySummary,
  EpisodeItem,
  HistoryEntry,
  HistoryQuery,
  ImageTypeEnum,
  ItemFilterEnum,
  ItemQuery,
  LibraryTypeEnum,
  LyricLine,
  MediaDetail,
  MediaLibrary,
  MediaLibraryItem,
  MediaItemTypeEnum,
  MediaSource,
  Paged,
  PersonRef,
  PhotoAlbumSummary,
  PhotoItem,
  PlaybackSource,
  QuickConnectSession,
  QuickConnectState,
  ReportArgs,
  ResolvePlaybackOpts,
  SeasonItem,
  SearchGroupKind,
  SearchResultGroup,
  ServerFlavor,
  ServerInfo,
  SortByEnum,
  SubtitleStreamInfo,
  SubtitleTrack,
  UserConfiguration,
  UserItemData,
  VideoStreamInfo,
} from '@/adapter/model';
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import { buildDeviceProfile } from '@/adapter/DeviceProfileBuilder';
import { compareVersion } from '@/util/semver';
import { msToTicks, ticksToMs } from '@/util/ticks';

/** adapter 构造参数（工厂入口，token 变更即重建实例） */
export interface AdapterParams {
  baseUrl: string;
  flavor: ServerFlavor;
  token?: string | null;
}

/** 可注入依赖（单测断言用；缺省取真实环境值，M1 文档 §4.6.3「全部经构造注入以便单测断言」） */
export interface AdapterDeps {
  clientName?: string;
  deviceName?: string;
  deviceId?: string;
  appVersion?: string;
  api?: ApiClient;
}

/**
 * SortBy 枚举 → 服务器 SortBy 字段链（双端差异见 constant/sortCatalog）。
 * 旧的 SORTBY_PARAM_MAP 已由 SORT_CHAIN 取代：Emby 使用带兜底的复合链，
 * Jellyfin 不支持的字段（Filename/Size/Container 等）回退 SortName。
 */
function sortParamOf(flavor: ServerFlavor, sortBy: SortByEnum): string {
  return (SORT_CHAIN[flavor][sortBy] ?? ['SortName']).join(',');
}

/** 排序方向 → 服务器参数映射 */
const SORT_ORDER_PARAM_MAP: Record<string, string> = {
  ASC: 'Ascending',
  DESC: 'Descending',
};

/** /System/Info/Public 响应（探测） */
interface PublicInfoResponse {
  Id?: string;
  ServerName?: string;
  Version?: string;
  ProductName?: string;
}

/** AuthenticateByName 响应（两端同构） */
interface AuthenticateByNameResponse {
  AccessToken?: string;
  ServerId?: string;
  User?: {
    Id?: string;
    Name?: string;
    PrimaryImageTag?: string;
  };
}

/** /Users/{uid}/Views 与 /Users/{uid}/Items 的条目原始形态（M1 消费字段 + M2 季集增量） */
interface ServerItemResponse {
  Id?: string;
  Type?: string;
  Name?: string;
  ProductionYear?: number;
  /** 服务器字段名为 RunTimeTicks（大写 T；M1 曾误作 RuntimeTicks，M2 修正——时长在真实服务器上一直取不到） */
  RunTimeTicks?: number;
  CollectionType?: string;
  ImageTags?: { Primary?: string };
  /**
   * 借用图回退（Emby 实测：文件夹/虚拟条目自身无 Primary 图时，服务器指向一个子条目的图）：
   * PrimaryImageItemId = 提供图片的条目 id，PrimaryImageTag = 该图的 tag。
   * 图片 URL 需用 PrimaryImageItemId 而不是本条目 id 拼接。
   */
  PrimaryImageItemId?: string;
  PrimaryImageTag?: string;
  UserData?: {
    Played?: boolean;
    PlayCount?: number;
    IsFavorite?: boolean;
    PlaybackPositionTicks?: number;
    /** M6：观看历史（UserData.LastPlayedDate ISO 8601 → lastPlayedAtMs） */
    LastPlayedDate?: string;
  };
  /** M2 季集增量：季号/集号、所属剧集与季、集简介（getSeasons/getEpisodes 消费） */
  IndexNumber?: number;
  SeriesId?: string;
  SeasonId?: string;
  /** M6：观看历史集行所属剧集名（Episode DTO 默认携带） */
  SeriesName?: string;
  /** M6：观看历史季号（历史页副标题「剧名 · S1E2」） */
  ParentIndexNumber?: number;
  Overview?: string;
  /** M5 音乐/照片增量（AudioItem/PhotoItem/ChildCount 翻译消费） */
  AlbumArtist?: string;
  Artists?: string[];
  AlbumId?: string;
  Album?: string;
  /** Fields=ChildCount（相册/专辑「数量」） */
  ChildCount?: number;
  /** Fields=Path（照片 fileName 取 basename；不透传完整路径） */
  Path?: string;
  Width?: number;
  Height?: number;
  /** 照片拍摄日期：DateCreated 优先、PremiereDate 兜底（→ ms） */
  DateCreated?: string;
  PremiereDate?: string;
  /** M8：LiveTV / 插件频道条目字段 */
  ChannelNumber?: string;
  ChannelId?: string;
  ChannelName?: string;
  StartDate?: string;
  EndDate?: string;
  Status?: string;
}

/** 详情响应原始形态（getItemDetail；Fields 覆盖 MediaDetail 全部字段，02 §4.3） */
interface DetailItemResponse extends ServerItemResponse {
  OriginalTitle?: string;
  Overview?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  Genres?: string[];
  Taglines?: string[];
  People?: PersonResponse[];
  MediaSources?: MediaSourceInfoResponse[];
  /** Fields=Path（详情页文件信息卡） */
  Path?: string;
  ImageTags?: { Primary?: string; Logo?: string };
  /** Backdrop 标签数组（与 ImageTags 分离；取首个作 Hero） */
  BackdropImageTags?: string[];
}

/** 演职员原始形态 */
interface PersonResponse {
  Id?: string;
  Name?: string;
  Role?: string;
  /** 服务器 Person.Type（Actor/Director/Writer/Producer/GuestStar/Composer…） */
  Type?: string;
  PrimaryImageTag?: string;
}

/** MediaStream 原始形态（PlaybackInfo 响应 MediaStreams[]，03 §4.5.1） */
interface MediaStreamResponse {
  Index?: number;
  Type?: string;
  /** 视频轨为编解码；字幕轨为原始格式（srt/ass/pgs/subrip…） */
  Codec?: string;
  DisplayTitle?: string;
  Title?: string;
  /** ISO 639-2 三字码（如 chi/eng） */
  Language?: string;
  Channels?: number;
  IsDefault?: boolean;
  IsForced?: boolean;
  /** 服务器按 SubtitleProfiles 判定：External=外挂 / Encode=烧录（缺省两者皆否） */
  DeliveryMethod?: string;
  /** 外挂轨相对 URL（可能已含 api_key） */
  DeliveryUrl?: string;
  // —— 详情页「音视频字幕信息」技术字段（服务器返回即可用，缺失即不展示）——
  Profile?: string;
  Level?: number;
  Width?: number;
  Height?: number;
  AspectRatio?: string;
  IsInterlaced?: boolean;
  AverageFrameRate?: number;
  RealFrameRate?: number;
  BitRate?: number;
  VideoRange?: string;
  ColorSpace?: string;
  BitDepth?: number;
  PixelFormat?: string;
  RefFrames?: number;
  ChannelLayout?: string;
  SampleRate?: number;
}

/** MediaSourceInfo 原始形态（详情与 PlaybackInfo 响应同构，M2 消费字段） */
interface MediaSourceInfoResponse {
  Id?: string;
  Name?: string;
  Container?: string;
  RunTimeTicks?: number;
  Size?: number;
  SupportsDirectPlay?: boolean;
  SupportsTranscoding?: boolean;
  /** 服务器返回的相对 URL（M2 仅透传保存、不使用，M3 分支） */
  TranscodingUrl?: string;
  /** M3：轨道列表（resolvePlayback 翻译 subtitleList/audioList） */
  MediaStreams?: MediaStreamResponse[];
}

/** PlaybackInfo 响应原始形态 */
interface PlaybackInfoResponse {
  PlaySessionId?: string;
  MediaSources?: MediaSourceInfoResponse[];
}

/** 分页响应原始形态 */
interface ItemsResponse {
  Items?: ServerItemResponse[];
  TotalRecordCount?: number;
  StartIndex?: number;
}

/** GET /Users/{uid} 响应（仅取 Configuration，媒体管理用） */
interface UserResponse {
  Configuration?: UserConfiguration;
}

/** 非播放实体（Genres/Tags/Studios/Channels）原始形态 */
interface EntityResponse {
  Id?: string;
  Name?: string;
  ImageTags?: { Primary?: string };
  PrimaryImageTag?: string;
  ChildCount?: number;
}

interface EntityItemsResponse {
  Items?: EntityResponse[];
  TotalRecordCount?: number;
}

/** 数组或 { Items } 两种响应形态（LiveTV Timers 等端点存在差异） */
function itemsOf<T>(
  response: { Items?: T[]; TotalRecordCount?: number } | T[]
): { items: T[]; total: number } {
  if (Array.isArray(response)) {
    return { items: response, total: response.length };
  }
  return { items: response.Items ?? [], total: response.TotalRecordCount ?? 0 };
}

/** 从服务器条目翻译统一模型 UserData（getUserViews / listItems 共用） */
function translateUserData(item: ServerItemResponse): UserItemData {
  const raw = item.UserData;
  const playbackPositionMs = ticksToMs(raw?.PlaybackPositionTicks ?? 0);
  const runtimeMs = item.RunTimeTicks !== undefined ? ticksToMs(item.RunTimeTicks) : undefined;
  const data: UserItemData = {
    played: raw?.Played ?? false,
    playCount: raw?.PlayCount ?? 0,
    favorite: raw?.IsFavorite ?? false,
    playbackPositionMs,
  };
  // 非服务器字段直传：由 playbackPositionMs/runtimeMs 计算（0–100），无 runtimeMs 时不产出（02 口径）
  if (runtimeMs !== undefined && runtimeMs > 0 && playbackPositionMs > 0) {
    data.playedPercentage = Math.min(100, Math.round((playbackPositionMs / runtimeMs) * 100));
  }
  return data;
}

/** 版本过低判定（§4.4 semver；设计文档 §5.1） */
function isVersionTooLow(flavor: ServerFlavor, version: string): boolean {
  const minVersion = flavor === 'JELLYFIN' ? MIN_JELLYFIN_VERSION : MIN_EMBY_VERSION;
  return version !== '' && compareVersion(version, minVersion) < 0;
}

/**
 * 季号排序权重（02 §4.3）：缺失/0 排最后，其余按季号升序——
 * 「默认选中第一季」依赖该确定性（02 §4.11）。
 */
function seasonNumberOrder(indexNumber: number): number {
  return indexNumber > 0 ? indexNumber : Number.MAX_SAFE_INTEGER;
}

/**
 * 服务器条目 Type → MediaItemTypeEnum 白名单翻译（model.ts 即服务器 Item Type 词表）。
 * 词表外（服务器扩展类型如 Channel 等）或缺失返回 undefined，调用方决定跳过该条目，
 * 不编造默认值、不做无校验强转（统一模型不透传脏值）。
 * Folder 仅在文件夹浏览（Items?Recursive=false）时纳入：其余列表（搜索/照片/季集等）
 * 仍按词表外跳过，避免目录条目混入可点开的条目列表。
 */
/** 统一模型允许的条目类型（Type 词表外/缺失的条目直接跳过；Folder 是否放行由调用场景决定） */
const VALID_ITEM_TYPES: ReadonlySet<string> = new Set<MediaItemTypeEnum>([
  'Movie',
  'Series',
  'Season',
  'Episode',
  'Person',
  'MusicAlbum',
  'MusicArtist',
  'Audio',
  'Playlist',
  'PhotoAlbum',
  'Photo',
  'Video',
  'Book',
  'Trailer',
  'MusicVideo',
  'BoxSet',
  'Game',
  'GameSystem',
  'Channel',
  'Program',
  'TvChannel',
  'Recording',
  'Timer',
  'SeriesTimer',
  'Genre',
  'Studio',
]);

function translateItemType(
  raw: string | undefined,
  allowFolder = false
): MediaItemTypeEnum | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === 'Folder') {
    return allowFolder ? 'Folder' : undefined;
  }
  return VALID_ITEM_TYPES.has(raw) ? (raw as MediaItemTypeEnum) : undefined;
}

/** 服务器 Person.Type（小写化）→ PersonRef.kind 映射（02 §4.2） */
const PERSON_KIND_MAP: Record<string, PersonRef['kind']> = {
  actor: 'Actor',
  director: 'Director',
  writer: 'Writer',
  producer: 'Producer',
  gueststar: 'GuestStar',
};

/** ISO 8601 时间串 → ms（无效/缺失返回 undefined，调用方不产出该字段） */
function isoToMs(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

/** 服务器 Path → 文件名 basename（含扩展名；缺失/空回退 undefined，调用方回退 name） */
function basenameOf(path: string | undefined): string | undefined {
  if (path === undefined || path === '') {
    return undefined;
  }
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

/** 演员排前权重（02 §4.2 peopleList「演员在前」） */
function personKindOrder(kind: PersonRef['kind']): number {
  return kind === 'Actor' ? 0 : 1;
}

/**
 * 音轨翻译（03 §4.5.1 第 3 条）：Type==="Audio" → AudioTrack，
 * title 取 DisplayTitle || Title || Language，Channels/Codec 直传。
 */
function translateAudioTracks(source: MediaSourceInfoResponse): AudioTrack[] {
  return (source.MediaStreams ?? []).flatMap((stream) => {
    if (stream.Type !== 'Audio' || stream.Index === undefined) {
      return [];
    }
    const track: AudioTrack = {
      streamIndex: stream.Index,
      language: stream.Language,
      title: stream.DisplayTitle ?? stream.Title ?? stream.Language,
      codec: stream.Codec,
      channels: stream.Channels,
      isDefault: stream.IsDefault,
    };
    return [track];
  });
}

/** 视频轨技术信息翻译（详情页音视频字幕信息；Index 缺失的轨道跳过） */
function translateVideoStreams(source: MediaSourceInfoResponse): VideoStreamInfo[] {
  return (source.MediaStreams ?? []).flatMap((stream) => {
    if (stream.Type !== 'Video' || stream.Index === undefined) {
      return [];
    }
    return [
      {
        index: stream.Index,
        title: stream.DisplayTitle ?? stream.Title,
        codec: stream.Codec,
        profile: stream.Profile,
        level: stream.Level,
        width: stream.Width,
        height: stream.Height,
        aspectRatio: stream.AspectRatio,
        isInterlaced: stream.IsInterlaced,
        frameRate: stream.RealFrameRate ?? stream.AverageFrameRate,
        bitrateBps: stream.BitRate,
        videoRange: stream.VideoRange,
        colorSpace: stream.ColorSpace,
        bitDepth: stream.BitDepth,
        pixelFormat: stream.PixelFormat,
        refFrames: stream.RefFrames,
      },
    ];
  });
}

/** 音频轨技术信息翻译（详情页音视频字幕信息；Index 缺失的轨道跳过） */
function translateAudioStreamInfoList(source: MediaSourceInfoResponse): AudioStreamInfo[] {
  return (source.MediaStreams ?? []).flatMap((stream) => {
    if (stream.Type !== 'Audio' || stream.Index === undefined) {
      return [];
    }
    return [
      {
        index: stream.Index,
        title: stream.DisplayTitle ?? stream.Title ?? stream.Language,
        codec: stream.Codec,
        profile: stream.Profile,
        channelLayout: stream.ChannelLayout,
        channels: stream.Channels,
        sampleRate: stream.SampleRate,
        bitrateBps: stream.BitRate,
        isDefault: stream.IsDefault,
      },
    ];
  });
}

/** 字幕轨技术信息翻译（详情页音视频字幕信息；Index 缺失的轨道跳过） */
function translateSubtitleStreamInfoList(source: MediaSourceInfoResponse): SubtitleStreamInfo[] {
  return (source.MediaStreams ?? []).flatMap((stream) => {
    if (stream.Type !== 'Subtitle' || stream.Index === undefined) {
      return [];
    }
    return [
      {
        index: stream.Index,
        title: stream.DisplayTitle ?? stream.Title ?? stream.Language,
        language: stream.Language,
        format: stream.Codec,
        isExternal: stream.DeliveryMethod === 'External',
        isForced: stream.IsForced,
        isDefault: stream.IsDefault,
      },
    ];
  });
}

/**
 * MediaSourceInfo → 统一模型（详情 mediaSourceList 与 resolvePlayback 共用）。
 * TranscodingUrl 仅透传保存（M2 不拼不播，M3 直接 {base}{TranscodingUrl}，设计文档 §6.1）。
 */
function translateMediaSource(raw: MediaSourceInfoResponse): MediaSource {
  const source: MediaSource = {
    id: raw.Id ?? '',
    name: raw.Name ?? '',
    container: raw.Container ?? '',
    supportsDirectPlay: raw.SupportsDirectPlay ?? false,
    supportsTranscoding: raw.SupportsTranscoding ?? false,
    videoStreamList: translateVideoStreams(raw),
    audioStreamList: translateAudioStreamInfoList(raw),
    subtitleStreamList: translateSubtitleStreamInfoList(raw),
  };
  if (raw.RunTimeTicks !== undefined) {
    source.runtimeMs = ticksToMs(raw.RunTimeTicks);
  }
  if (raw.Size !== undefined) {
    source.sizeBytes = raw.Size;
  }
  if (raw.TranscodingUrl !== undefined) {
    source.transcodingUrl = raw.TranscodingUrl;
  }
  return source;
}

export abstract class BaseAdapter implements ServerAdapter {
  readonly flavor: ServerFlavor;
  readonly baseUrl: string;

  protected readonly token: string | null;
  protected readonly api: ApiClient;
  private readonly clientName: string;
  private readonly deviceName: string;
  private readonly deviceId: string;
  private readonly appVersion: string;

  constructor(params: AdapterParams, deps?: AdapterDeps) {
    this.flavor = params.flavor;
    this.baseUrl = params.baseUrl;
    this.token = params.token ?? null;
    this.api = deps?.api ?? apiClient;
    this.clientName = deps?.clientName ?? CLIENT_NAME;
    // expo-device deviceName 可能为 null，回退客户端名
    this.deviceName = deps?.deviceName ?? Device.deviceName ?? this.clientName;
    this.deviceId = deps?.deviceId ?? getDeviceId();
    this.appVersion = deps?.appVersion ?? APP_VERSION;
  }

  // —— 差异点抽象（子类覆写）——

  /** 设备认证头名称（§6.1：Jellyfin 标准 Authorization，Emby X-Emby-Authorization） */
  protected abstract authHeaderName(): 'Authorization' | 'X-Emby-Authorization';

  /**
   * token 注入方式（§6.1）：Emby 返回 X-Emby-Token 独立头；
   * Jellyfin 官方推荐 Token 拼入同一 Authorization 头（buildHeaders 内实现），此处返回空对象。
   */
  protected abstract tokenHeader(token: string): Record<string, string>;

  /** 图片缓存破坏参数：Jellyfin 追加 tag；Emby 不追加 */
  protected abstract imageTagQuery(tag?: string): Record<string, string>;

  /**
   * DELETE /Videos/ActiveEncodings 的 query 参数名（03 §4.5.3 flavor 差异）：
   * Jellyfin 新版为 playSessionId，Emby 为 id（设计文档 §7.2 记载形态）。
   */
  protected abstract activeEncodingsQueryKey(): 'playSessionId' | 'id';

  // —— 认证头与 URL 组装 ——

  /**
   * MediaBrowser 设备头：MediaBrowser Client="…", Device="…", DeviceId="…", Version="…"[, Token="…"]
   * Client/Device/DeviceId/Version 取 CLIENT_NAME / expo-device deviceName / deviceId / APP_VERSION。
   * token 存在时按 flavor 语义注入：Jellyfin 拼入同一 Authorization 头（§6.1 官方推荐），
   * Emby 设备头不带 Token、由 tokenHeader 追加 X-Emby-Token 独立头。
   */
  protected buildHeaders(token?: string | null): Record<string, string> {
    let value =
      `MediaBrowser Client="${this.clientName}", Device="${this.deviceName}", ` +
      `DeviceId="${this.deviceId}", Version="${this.appVersion}"`;
    // Jellyfin：Token 拼入同一头；Emby：保持设备头纯净（tokenHeader 注入 X-Emby-Token）
    if (token && this.flavor === 'JELLYFIN') {
      value += `, Token="${token}"`;
    }
    const headers: Record<string, string> = { [this.authHeaderName()]: value };
    if (token) {
      Object.assign(headers, this.tokenHeader(token));
    }
    return headers;
  }

  /** baseUrl + path 拼接（baseUrl 已规范化为无结尾斜杠） */
  private urlOf(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /**
   * 完整图片 URL（§4.6.3 imageUrl 行）：{base}/Items/{itemId}/Images/{type}
   * + maxWidth={w}&quality=85 + imageTagQuery() 产物 + api_key={token}。
   * 图片 URL 由 expo-image 直接加载、不经 ApiClient，认证只能进 URL。
   */
  protected buildImageUrl(
    itemId: string,
    type: ImageTypeEnum,
    maxWidth: number,
    tag?: string
  ): string {
    const params = new URLSearchParams({
      maxWidth: String(maxWidth),
      quality: String(IMAGE_QUALITY),
    });
    Object.entries(this.imageTagQuery(tag)).forEach(([key, value]) => {
      params.set(key, value);
    });
    if (this.token) {
      params.set('api_key', this.token);
    }
    return `${this.urlOf(`/Items/${itemId}/Images/${type}`)}?${params.toString()}`;
  }

  /** 查询参数 → querystring（跳过 undefined/空串，按给定顺序稳定可断言） */
  private buildQuery(query: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, value);
      }
    });
    return params.toString();
  }

  /** 标签过滤参数名：Emby 用 TagIds（id），Jellyfin 用 Tags（名称） */
  protected tagQueryKey(): 'TagIds' | 'Tags' {
    return this.flavor === 'EMBY' ? 'TagIds' : 'Tags';
  }

  /** 标签过滤值（按 tagQueryKey 选择 id 或 name；空数组返回 undefined） */
  protected tagQueryValue(
    tagFilters: ItemQuery['tagFilters']
  ): string | undefined {
    if (tagFilters === undefined || tagFilters.length === 0) {
      return undefined;
    }
    return tagFilters
      .map((tag) => (this.tagQueryKey() === 'TagIds' ? tag.id : tag.name))
      .join(',');
  }

  // —— M1 六个方法 ——

  /**
   * 探测：GET /System/Info/Public，带设备认证头（无 token），超时 PROBE_TIMEOUT_MS。
   * ProductName 含 "Jellyfin" → JELLYFIN；含 "Emby" → EMBY；其余/缺失 → 抛 NOT_MEDIA_SERVER。
   */
  async probe(): Promise<ServerInfo> {
    const data = await this.api.request<PublicInfoResponse>({
      method: 'GET',
      url: this.urlOf('/System/Info/Public'),
      headers: this.buildHeaders(),
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const productName = data.ProductName ?? '';
    let flavor: ServerFlavor;
    if (productName.includes('Jellyfin')) {
      flavor = 'JELLYFIN';
    } else if (productName.includes('Emby')) {
      flavor = 'EMBY';
    } else if (!productName && data.Id && data.ServerName) {
      // Emby 4.10+ 的 /System/Info/Public 不再返回 ProductName（实测 4.10.2.0），
      // 缺失但具备 Id+ServerName 标准结构时兜底判为 EMBY（Jellyfin 恒有 ProductName）
      flavor = 'EMBY';
    } else {
      // 200 但非 Jellyfin/Emby（如路由器管理页），或响应缺 ProductName
      throw new AppError('NOT_MEDIA_SERVER');
    }
    const version = data.Version ?? '';
    return {
      flavor,
      baseUrl: this.baseUrl,
      serverId: data.Id ?? '',
      serverName: data.ServerName ?? '',
      version,
      versionTooLow: isVersionTooLow(flavor, version),
    };
  }

  /**
   * 登录：POST /Users/AuthenticateByName，body { Username, Pw }（两端字段一致，§6.1）。
   * AccessToken → token、User.Id/Name、顶层 ServerId；avatarUrl 按用户头图 tag 拼出。
   */
  async login(username: string, password: string): Promise<AuthResult> {
    const data = await this.api.request<AuthenticateByNameResponse>({
      method: 'POST',
      url: this.urlOf('/Users/AuthenticateByName'),
      headers: this.buildHeaders(),
      body: { Username: username, Pw: password },
    });
    const user = data.User;
    if (!data.AccessToken || !user?.Id) {
      // 理论不可达（服务器异常响应形态）；按未知错误归一
      throw new AppError('UNKNOWN');
    }
    const auth: AuthResult = {
      userId: user.Id,
      userName: user.Name ?? username,
      token: data.AccessToken,
      serverId: data.ServerId ?? '',
    };
    if (user.PrimaryImageTag) {
      const params = new URLSearchParams({
        maxWidth: String(AVATAR_MAX_WIDTH),
        tag: user.PrimaryImageTag,
      });
      auth.avatarUrl = `${this.urlOf(`/Users/${user.Id}/Images/Primary`)}?${params.toString()}`;
    }
    return auth;
  }

  /**
   * 库列表：GET /Users/{userId}/Views。
   * Items[] → MediaLibrary[]：CollectionType 原值存档，经 COLLECTION_TYPE_MAP 翻译 type（缺省 MIXED）。
   * includeHidden=true 时服务器返回含隐藏库的全量列表（媒体管理页用；不支持的服务器忽略该参数）。
   */
  async getUserViews(userId: string, includeHidden?: boolean): Promise<MediaLibrary[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(`/Users/${userId}/Views${includeHidden === true ? '?includeHidden=true' : ''}`),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).map((item) => {
      const id = item.Id ?? '';
      const collectionType = item.CollectionType;
      const type: LibraryTypeEnum = collectionType
        ? (COLLECTION_TYPE_MAP[collectionType] ?? 'MIXED')
        : 'MIXED';
      return {
        id,
        name: item.Name ?? '',
        collectionType,
        type,
        primaryImageUrl: item.ImageTags?.Primary
          ? this.buildImageUrl(id, 'Primary', POSTER_MAX_WIDTH, item.ImageTags.Primary)
          : undefined,
      };
    });
  }

  /** 用户配置：GET /Users/{uid} → Configuration（普通用户 token 可读；缺省空对象） */
  async getUserConfiguration(userId: string): Promise<UserConfiguration> {
    const data = await this.api.request<UserResponse>({
      method: 'GET',
      url: this.urlOf(`/Users/${userId}`),
      headers: this.buildHeaders(this.token),
    });
    return data.Configuration ?? {};
  }

  /** 用户配置：POST /Users/{uid}/Configuration 全量回写（调用方先 GET 再改字段，避免丢其他配置） */
  async updateUserConfiguration(userId: string, config: UserConfiguration): Promise<void> {
    await this.api.request<unknown>({
      method: 'POST',
      url: this.urlOf(`/Users/${userId}/Configuration`),
      headers: this.buildHeaders(this.token),
      body: config,
    });
  }

  /**
   * 库数量：GET /Users/{uid}/Items?ParentId&Recursive=true&Limit=0&IncludeItemTypes={类型口径}。
   * 数量口径与海报墙一致（§4.6.3）；取 TotalRecordCount（/Views 的数量字段不稳定，故二次请求）。
   * collectionType 由调用方从 MediaLibrary 传入（接口以可选项扩展，M2+ 不受影响）。
   */
  async getLibraryItemCount(
    userId: string,
    libraryId: string,
    collectionType?: string
  ): Promise<number> {
    const libraryType: LibraryTypeEnum = collectionType
      ? (COLLECTION_TYPE_MAP[collectionType] ?? 'MIXED')
      : 'MIXED';
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: libraryId,
          Recursive: 'true',
          Limit: '0',
          IncludeItemTypes: INCLUDE_ITEM_TYPES_BY_LIBRARY[libraryType],
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return data.TotalRecordCount ?? 0;
  }

  /**
   * 海报墙/列表统一入口：GET /Users/{uid}/Items，服务端分页。
   * 参数名映射（§4.6.3 表）：kinds→IncludeItemTypes 原值直传、sortBy→SortBy 映射、
   * sortOrder→Ascending/Descending、filters→Filters 原值逗号连接。
   * 文件夹浏览传 recursive=false 只列当前层（子目录以 Folder 条目返回，Fields=ChildCount 供数量角标）。
   */
  async listItems(query: ItemQuery): Promise<Paged<MediaLibraryItem>> {
    const sortBy = query.sortBy ?? 'SORT_NAME';
    const isChannelItems = query.channelId !== undefined;
    const endpoint = isChannelItems
      ? `/Channels/${query.channelId}/Items`
      : `/Users/${query.userId}/Items`;
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `${endpoint}?${this.buildQuery({
          // /Users/{uid}/Items 的 userId 在路径中；插件频道端点需显式 UserId
          UserId: isChannelItems ? query.userId : undefined,
          ParentId: query.parentId,
          IncludeItemTypes: query.kinds?.join(','),
          SortBy: sortParamOf(this.flavor, sortBy),
          SortOrder: query.sortOrder ? SORT_ORDER_PARAM_MAP[query.sortOrder] : undefined,
          Filters: query.filters?.length ? query.filters.join(',') : undefined,
          GenreIds: query.genreIds?.length ? query.genreIds.join(',') : undefined,
          StudioIds: query.studioIds?.length ? query.studioIds.join(',') : undefined,
          [this.tagQueryKey()]: this.tagQueryValue(query.tagFilters),
          StartIndex: String(query.startIndex),
          Limit: String(query.limit),
          Recursive: query.recursive === false ? 'false' : 'true',
          Fields: 'PrimaryImageAspectRatio,UserData,ChildCount',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      // Type 词表外/缺失的条目直接跳过（不进统一模型，避免越界脏值流入 M2 分发）；
      // 文件夹浏览（Recursive=false）时把子目录 Folder 一并纳入
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item, query.recursive === false);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? query.startIndex,
    };
  }

  /**
   * 条目 → 统一模型（海报墙消费；subtext 取年份）。
   * Type 词表外或缺失时返回 null，由调用方跳过该条目（不编造默认类型）。
   * allowFolder：文件夹浏览时为 true，子目录 Folder 进统一模型。
   */
  private translateListItem(
    item: ServerItemResponse,
    allowFolder = false
  ): MediaLibraryItem | null {
    const id = item.Id ?? '';
    const type = translateItemType(item.Type, allowFolder);
    if (type === undefined) {
      return null;
    }
    const tag = item.ImageTags?.Primary;
    // 海报 URL：自身有 Primary 图则用；否则用服务器的借用图回退（PrimaryImageItemId + PrimaryImageTag）。
    // Emby 实测：文件夹自身 ImageTags 为空，但会给出目录内某子条目的图（Emby Web 文件夹卡就是这么显示的）。
    const posterImageUrl =
      tag !== undefined
        ? this.buildImageUrl(id, 'Primary', POSTER_MAX_WIDTH, tag)
        : item.PrimaryImageItemId !== undefined
          ? this.buildImageUrl(
              item.PrimaryImageItemId,
              'Primary',
              POSTER_MAX_WIDTH,
              item.PrimaryImageTag
            )
          : undefined;
    // M5：专辑网格副标题「艺人 · 年份」（视频条目维持年份不变）
    const yearText = item.ProductionYear !== undefined ? String(item.ProductionYear) : undefined;
    const subtext =
      type === 'MusicAlbum' && item.AlbumArtist !== undefined
        ? yearText !== undefined
          ? `${item.AlbumArtist} · ${yearText}`
          : item.AlbumArtist
        : yearText;
    return {
      id,
      type,
      name: item.Name ?? '',
      subtext,
      productionYear: item.ProductionYear,
      posterImageUrl,
      runtimeMs: item.RunTimeTicks !== undefined ? ticksToMs(item.RunTimeTicks) : undefined,
      // 文件夹浏览的数量角标（Fields=ChildCount）；服务器未返回该字段时不产出
      ...(item.ChildCount !== undefined ? { childCount: item.ChildCount } : {}),
      userData: translateUserData(item),
    };
  }

  /**
   * 带 token 的完整图片 URL（对外契约；tag 仅在 adapter 内部列表翻译时可得）。
   * M5：maxWidth 缺省 → 原图（不带 maxWidth/quality 参数，「查看原图」与保存用，05 文档 §4.3）。
   */
  imageUrl(itemId: string, type: ImageTypeEnum, maxWidth?: number): string {
    if (maxWidth === undefined) {
      const params = new URLSearchParams();
      Object.entries(this.imageTagQuery()).forEach(([key, value]) => {
        params.set(key, value);
      });
      if (this.token) {
        params.set('api_key', this.token);
      }
      const query = params.toString();
      const base = this.urlOf(`/Items/${itemId}/Images/${type}`);
      return query === '' ? base : `${base}?${query}`;
    }
    return this.buildImageUrl(itemId, type, maxWidth);
  }

  // —— M2：详情主数据与列表封装（共享实现，设计 §6.1 差异表未列为两端差异）——

  /**
   * 详情主数据：GET /Users/{userId}/Items/{itemId}，Fields 覆盖 MediaDetail 全部字段（02 §4.3）。
   * Person 也是条目（人物页复用本方法取头像/简介/姓名）。
   */
  async getItemDetail(userId: string, itemId: string): Promise<MediaDetail> {
    const data = await this.api.request<DetailItemResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items/${itemId}?${this.buildQuery({
          Fields:
            'Overview,Genres,People,MediaSources,Taglines,OriginalTitle,OfficialRating,CommunityRating,Path',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    const type = translateItemType(data.Type);
    if (type === undefined) {
      // 详情主数据缺 Type 属异常响应形态（正常条目必有 Type），按未知错误归一
      throw new AppError('UNKNOWN');
    }
    const id = data.Id ?? '';
    const peopleList = (data.People ?? [])
      .flatMap((person) => {
        const personId = person.Id ?? '';
        if (personId === '') {
          return [];
        }
        // Person.Type 小写化映射（02 §4.2）；映射表外（Composer 等）按演员处理：peopleList 仅
        // 以 kind 决定排序权重（演员在前），无其他语义消费，避免演职员在映射表缺口处整条丢失
        const kind: PersonRef['kind'] =
          (person.Type !== undefined ? PERSON_KIND_MAP[person.Type.toLowerCase()] : undefined) ??
          'Actor';
        const ref: PersonRef = {
          id: personId,
          name: person.Name ?? '',
          kind,
          headImageUrl: person.PrimaryImageTag
            ? this.buildImageUrl(personId, 'Primary', PERSON_HEAD_MAX_WIDTH, person.PrimaryImageTag)
            : undefined,
        };
        if (person.Role !== undefined) {
          ref.role = person.Role;
        }
        return [ref];
      })
      // 稳定排序：演员在前、其余保持服务器顺序（02 §4.2）
      .sort((a, b) => personKindOrder(a.kind) - personKindOrder(b.kind));

    const primaryTag = data.ImageTags?.Primary;
    // Person 条目的 Primary 即头像：按 02 §4.3「imageUrl(personId, "Primary", 200)」用
    // PERSON_HEAD_MAX_WIDTH 产出（页面 96px 圆头像直接消费，避免 600px 宽图的带宽/解码浪费）
    const posterImageUrl = primaryTag
      ? this.buildImageUrl(
          id,
          'Primary',
          type === 'Person' ? PERSON_HEAD_MAX_WIDTH : DETAIL_POSTER_MAX_WIDTH,
          primaryTag
        )
      : undefined;
    // Hero：Backdrop 取首标签（maxWidth=1280）；无 Backdrop 回退 Primary（02 §4.2）
    const backdropTag = data.BackdropImageTags?.[0];
    const heroImageUrl = backdropTag
      ? this.buildImageUrl(id, 'Backdrop', DETAIL_BACKDROP_MAX_WIDTH, backdropTag)
      : posterImageUrl;
    const logoTag = data.ImageTags?.Logo;

    return {
      id,
      type,
      name: data.Name ?? '',
      originalTitle: data.OriginalTitle,
      overview: data.Overview,
      productionYear: data.ProductionYear,
      officialRating: data.OfficialRating,
      communityRating: data.CommunityRating,
      runtimeMs: data.RunTimeTicks !== undefined ? ticksToMs(data.RunTimeTicks) : undefined,
      genreList: data.Genres ?? [],
      taglineList: data.Taglines,
      peopleList,
      posterImageUrl,
      heroImageUrl,
      logoImageUrl: logoTag
        ? this.buildImageUrl(id, 'Logo', DETAIL_POSTER_MAX_WIDTH, logoTag)
        : undefined,
      path: data.Path,
      userData: translateUserData(data),
      mediaSourceList: (data.MediaSources ?? []).map(translateMediaSource),
      seriesId: data.SeriesId,
      seasonId: data.SeasonId,
      indexNumber: data.IndexNumber,
    };
  }

  /**
   * 季列表：GET /Shows/{seriesId}/Seasons（端点要求 seriesId 路径参数，02 §4.3）。
   * 结果按 indexNumber 升序（缺失/0 排最后），不依赖服务器返回顺序——「默认选中第一季」
   * 的确定性依赖该排序（02 §4.3/§4.11）。
   */
  async getSeasons(userId: string, seriesId: string): Promise<SeasonItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Shows/${seriesId}/Seasons?${this.buildQuery({
          UserId: userId,
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? [])
      .flatMap((item) => {
        const translated = this.translateListItem(item);
        if (translated === null) {
          return [];
        }
        const season: SeasonItem = { ...translated, indexNumber: item.IndexNumber ?? 0 };
        return [season];
      })
      .sort((a, b) => seasonNumberOrder(a.indexNumber) - seasonNumberOrder(b.indexNumber));
  }

  /**
   * 集列表：GET /Shows/{seriesId}/Episodes（SeasonId 必传，02 §4.3）。
   * Fields=Overview 供集卡片单行简介（§4.11）；缩略图/进度/已看复用列表翻译（UserData 默认返回）。
   */
  async getEpisodes(
    userId: string,
    seriesId: string,
    seasonId: string
  ): Promise<EpisodeItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Shows/${seriesId}/Episodes?${this.buildQuery({
          UserId: userId,
          SeasonId: seasonId,
          Fields: 'PrimaryImageAspectRatio,Overview',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      if (translated === null) {
        return [];
      }
      const episode: EpisodeItem = {
        ...translated,
        seasonId: item.SeasonId ?? seasonId,
        seriesId: item.SeriesId ?? seriesId,
        indexNumber: item.IndexNumber ?? 0,
        overview: item.Overview,
      };
      return [episode];
    });
  }

  /** 相似推荐：GET /Items/{itemId}/Similar，上限 SIMILAR_LIMIT（02 §4.3） */
  async getSimilar(userId: string, itemId: string): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Items/${itemId}/Similar?${this.buildQuery({
          UserId: userId,
          Limit: String(SIMILAR_LIMIT),
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      return translated === null ? [] : [translated];
    });
  }

  /**
   * 人物出演作品：GET /Users/{uid}/Items?PersonIds=…&IncludeItemTypes=Movie,Series&Recursive=true
   * &SortBy=SortName（归并为 listItems 的具名封装，02 §4.3；不含集级条目）。
   */
  async getPersonFilmography(userId: string, personId: string): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          PersonIds: personId,
          IncludeItemTypes: 'Movie,Series',
          Recursive: 'true',
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      return translated === null ? [] : [translated];
    });
  }

  // —— M4：首页三区与搜索（04 §3/§4.3；共享 listItems 翻译路径的具名封装）——

  /**
   * 继续观看：GET /Users/{uid}/Items?Filters=IsResumable&IncludeItemTypes={类型}&Recursive=true
   * &SortBy=DatePlayed&SortOrder=Descending&Limit=HOME_ROW_LIMIT。
   * 类型由设置页多选（默认 Movie,Episode,Video；Video 为家庭视频/照片库中的视频条目）。
   * 按最近播放序返回有断点的条目（首页横向卡片行，设计文档 §7.1）。
   */
  async getResume(
    userId: string,
    includeItemTypes: readonly MediaItemTypeEnum[]
  ): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          Filters: 'IsResumable',
          IncludeItemTypes: includeItemTypes.join(','),
          Recursive: 'true',
          SortBy: 'DatePlayed',
          SortOrder: 'Descending',
          Limit: String(HOME_ROW_LIMIT),
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      return translated === null ? [] : [translated];
    });
  }

  /**
   * 下一集：GET /Shows/NextUp（两端一致端点），Limit=HOME_ROW_LIMIT。
   * 翻译为 EpisodeItem（响应含 SeriesId/SeasonId/IndexNumber）——04 §4.4 自动连播
   * 需按 seriesId 匹配当前剧集的下一集。
   */
  async getNextUp(userId: string): Promise<EpisodeItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Shows/NextUp?${this.buildQuery({
          UserId: userId,
          Limit: String(HOME_ROW_LIMIT),
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      if (translated === null) {
        return [];
      }
      const episode: EpisodeItem = {
        ...translated,
        seasonId: item.SeasonId ?? '',
        seriesId: item.SeriesId ?? '',
        indexNumber: item.IndexNumber ?? 0,
      };
      return [episode];
    });
  }

  /**
   * 最新添加（首页「最近添加」行，电影/剧集）：GET /Users/{uid}/Items
   * ?SortBy=DateCreated&SortOrder=Descending&IncludeItemTypes=Movie,Series&Recursive=true
   * 只收录最近 LATEST_WINDOW_DAYS 天入库的条目，排序仍按 DateCreated 降序。
   * （parentId 传入时限定库；limit 缺省首页行长度）。
   * 媒体库融合页每库行按库类型取不同类型，见 getLatestByTypes（不设时间窗）。
   */
  async getLatest(
    userId: string,
    parentId?: string,
    limit: number = HOME_ROW_LIMIT
  ): Promise<MediaLibraryItem[]> {
    const sinceIso = new Date(
      Date.now() - LATEST_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    return this.getLatestByTypes(userId, parentId, 'Movie,Series', limit, undefined, sinceIso);
  }

  /**
   * 指定条目类型的最新添加（媒体库融合页每库行）：GET /Users/{uid}/Items
   * ?ParentId=…&IncludeItemTypes=…&Filters=…&SortBy=DateCreated&SortOrder=Descending&Limit=…
   * 类型与筛选来自库的默认 Tab（resolveLibraryLatestQuery）；类型决定卡片图幅：
   * 单集/家庭视频为 16:9 剧照、电影/剧集为 2:3 海报、专辑为 1:1 封面。
   * sinceIso 传入时只收录该时间之后入库的条目。时间窗用 MinDateLastSavedForUser：
   * Emby/Jellyfin 均支持，且避开 Jellyfin 10.8/10.9 对 MinDateLastSaved 的参数绑定缺陷。
   */
  async getLatestByTypes(
    userId: string,
    parentId: string | undefined,
    includeItemTypes: string,
    limit: number,
    filters?: readonly ItemFilterEnum[],
    sinceIso?: string
  ): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: parentId,
          IncludeItemTypes: includeItemTypes,
          Filters: filters !== undefined && filters.length > 0 ? filters.join(',') : undefined,
          Recursive: 'true',
          SortBy: 'DateCreated',
          SortOrder: 'Descending',
          Limit: String(limit),
          MinDateLastSavedForUser: sinceIso,
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      return translated === null ? [] : [translated];
    });
  }

  /**
   * 搜索（04 §4.3）：按类型并发三次 GET /Users/{uid}/Items——SearchTerm={term}、
   * IncludeItemTypes 分别为 Movie/Series/Person、Recursive=true、Limit=SEARCH_GROUP_LIMIT、
   * 不传 SortBy（服务器按默认相关序返回）。按类型各设限额保证每组可见性。
   * 响应复用 listItems 翻译路径；人物头像复用 Primary 图、按 PERSON_AVATAR_MAX_WIDTH 收窄。
   */
  async search(userId: string, term: string): Promise<SearchResultGroup[]> {
    const types: { kind: SearchGroupKind; includeItemTypes: string }[] = [
      { kind: 'MOVIE', includeItemTypes: 'Movie' },
      { kind: 'SERIES', includeItemTypes: 'Series' },
      { kind: 'PERSON', includeItemTypes: 'Person' },
    ];
    const groups = await Promise.all(
      types.map(async ({ kind, includeItemTypes }) => {
        const data = await this.api.request<ItemsResponse>({
          method: 'GET',
          url: this.urlOf(
            `/Users/${userId}/Items?${this.buildQuery({
              SearchTerm: term,
              IncludeItemTypes: includeItemTypes,
              Recursive: 'true',
              Limit: String(SEARCH_GROUP_LIMIT),
              Fields: 'PrimaryImageAspectRatio',
              ImageTypeLimit: '1',
            })}`
          ),
          headers: this.buildHeaders(this.token),
        });
        const itemList = (data.Items ?? []).flatMap((item) => {
          const translated = this.translateListItem(item);
          if (translated === null) {
            return [];
          }
          // 人物头像卡：复用响应 Primary 图 tag，按头像宽度收窄请求（避免 400px 宽图浪费）
          if (kind === 'PERSON' && item.ImageTags?.Primary) {
            return [
              {
                ...translated,
                posterImageUrl: this.buildImageUrl(
                  translated.id,
                  'Primary',
                  PERSON_AVATAR_MAX_WIDTH,
                  item.ImageTags.Primary
                ),
              },
            ];
          }
          return [translated];
        });
        return { kind, itemList };
      })
    );
    // 空组剔除、组内保持服务器返回序
    return groups.filter((group) => group.itemList.length > 0);
  }

  // —— M4：收藏（mark/unmark 成对式，04 §4.4；端点两端一致，共享基础实现）——

  /** 收藏：POST /Users/{userId}/FavoriteItems/{itemId} */
  async markFavorite(userId: string, itemId: string): Promise<void> {
    await this.api.request({
      method: 'POST',
      url: this.urlOf(`/Users/${userId}/FavoriteItems/${itemId}`),
      headers: this.buildHeaders(this.token),
    });
  }

  /** 收藏态查询（迷你条队列仅剩当前曲时的收藏按钮）：只拉 UserData，避免整条详情 */
  async getItemFavorite(userId: string, itemId: string): Promise<boolean> {
    const data = await this.api.request<{ UserData?: { IsFavorite?: boolean } }>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items/${itemId}?${this.buildQuery({ Fields: 'UserData' })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return data.UserData?.IsFavorite === true;
  }

  /** 取消收藏：DELETE /Users/{userId}/FavoriteItems/{itemId} */
  async unmarkFavorite(userId: string, itemId: string): Promise<void> {
    await this.api.request({
      method: 'DELETE',
      url: this.urlOf(`/Users/${userId}/FavoriteItems/${itemId}`),
      headers: this.buildHeaders(this.token),
    });
  }

  /**
   * 删除条目：DELETE /Items/{itemId}（Emby/Jellyfin 同构）。
   * 服务器按用户权限判定（需 Delete 权限），无权限返回 403 由错误归一化为 FORBIDDEN。
   */
  async deleteItem(itemId: string): Promise<void> {
    await this.api.request({
      method: 'DELETE',
      url: this.urlOf(`/Items/${itemId}`),
      headers: this.buildHeaders(this.token),
    });
  }

  // —— M5：音频 universal 与音乐/照片浏览（05 文档 §4.3 端点映射表；全部共享实现）——

  /**
   * 音频 universal 统一端点 URL（设计文档 §8.4 原文模板 + PlaySessionId 增量参数）。
   * 直连时服务器 302 到 stream?static=true、否则实时转 mp4/aac，对队列逻辑透明；
   * maxBitrateBps 缺省 = 音频固定上限 20Mbps（音频无分辨率档位）。
   */
  buildAudioUniversalUrl(itemId: string, playSessionId: string, maxBitrateBps?: number): string {
    const bitrate = maxBitrateBps ?? AUDIO_MAX_STREAMING_BITRATE_BPS;
    const query = this.buildQuery({
      DeviceId: this.deviceId,
      api_key: this.token ?? '',
      PlaySessionId: playSessionId,
      MaxStreamingBitrate: String(bitrate),
      Container: UNIVERSAL_CONTAINER_LIST,
      TranscodingContainer: AUDIO_TRANSCODING_CONTAINER,
      TranscodingAudioCodec: AUDIO_TRANSCODING_AUDIO_CODEC,
    });
    return this.urlOf(`/Audio/${itemId}/universal?${query}`);
  }

  // —— M7：图书阅读（全部共享实现，双 Adapter 不新增覆写）——

  /**
   * Book 原文件下载 URL：{base}/Items/{itemId}/Download + api_key={token}。
   * 下载经 expo-file-system（不经 ApiClient）、渲染经 WebView，均不携带请求头，
   * 认证只能进 URL（与图片/音频 URL 同款机制）。Book 无媒体源概念，
   * 禁走 PlaybackInfo（Emby 对 Book 必 500），一律以本端点取原文件。
   */
  buildBookFileUrl(itemId: string): string {
    return this.urlOf(`/Items/${itemId}/Download?api_key=${encodeURIComponent(this.token ?? '')}`);
  }

  /** 服务器条目 → AudioItem（歌曲翻译共用路径；封面 = 条目 Primary） */
  private translateAudioItem(item: ServerItemResponse): AudioItem {
    const id = item.Id ?? '';
    const tag = item.ImageTags?.Primary;
    const audio: AudioItem = {
      id,
      name: item.Name ?? '',
      artistName: item.AlbumArtist ?? item.Artists?.[0],
      albumId: item.AlbumId,
      albumName: item.Album,
      indexNumber: item.IndexNumber,
      runtimeMs: item.RunTimeTicks !== undefined ? ticksToMs(item.RunTimeTicks) : undefined,
      coverImageUrl: tag
        ? this.buildImageUrl(id, 'Primary', AUDIO_ARTWORK_MAX_WIDTH, tag)
        : undefined,
      favorite: item.UserData?.IsFavorite === true,
    };
    return audio;
  }

  /** 分页页码 → StartIndex（页大小复用 M1 PAGE_SIZE，服务端分页口径与海报墙一致） */
  private startIndexOfPage(page: number): number {
    return page * PAGE_SIZE;
  }

  /** 专辑区：GET /Users/{uid}/Items?ParentId={libraryId}&IncludeItemTypes=MusicAlbum&SortBy=SortName */
  async getMusicAlbums(
    userId: string,
    libraryId: string,
    page: number
  ): Promise<Paged<MediaLibraryItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: libraryId,
          IncludeItemTypes: 'MusicAlbum',
          Recursive: 'true',
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          Fields: 'PrimaryImageAspectRatio,ChildCount',
          StartIndex: String(this.startIndexOfPage(page)),
          Limit: String(PAGE_SIZE),
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  /**
   * 艺人区：同专辑行，IncludeItemTypes=MusicArtist（头像 = Primary）。
   * 排序由音乐库菜单传入（艺人虚拟条目仅名称/添加日期/随机有效），缺省 SortName 升序。
   */
  async getMusicArtists(
    userId: string,
    libraryId: string,
    page: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: libraryId,
          IncludeItemTypes: 'MusicArtist',
          Recursive: 'true',
          SortBy: sortParamOf(this.flavor, sort?.sortBy ?? 'SORT_NAME'),
          SortOrder: SORT_ORDER_PARAM_MAP[sort?.sortOrder ?? 'ASC'],
          Fields: 'PrimaryImageAspectRatio,ChildCount',
          StartIndex: String(this.startIndexOfPage(page)),
          Limit: String(PAGE_SIZE),
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  /**
   * 歌单区：IncludeItemTypes=Playlist 全量查询，**不带 ParentId**——歌单常独立于
   * 音乐库存在（服务端全局条目），四区内查全量歌单（05 文档 §4.3）。
   */
  async getMusicPlaylists(userId: string, page: number): Promise<Paged<MediaLibraryItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          IncludeItemTypes: 'Playlist',
          Recursive: 'true',
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          Fields: 'PrimaryImageAspectRatio,ChildCount',
          StartIndex: String(this.startIndexOfPage(page)),
          Limit: String(PAGE_SIZE),
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  /**
   * 全部歌曲区：IncludeItemTypes=Audio，服务端分页。
   * 排序由音乐库菜单传入（标题/专辑/专辑艺人/日期/播放态/文件名/大小/容器/随机），
   * 缺省 SortName 升序。
   */
  async getAllSongs(
    userId: string,
    libraryId: string,
    page: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' },
    filters?: readonly ItemFilterEnum[]
  ): Promise<Paged<AudioItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: libraryId,
          IncludeItemTypes: 'Audio',
          Recursive: 'true',
          SortBy: sortParamOf(this.flavor, sort?.sortBy ?? 'SORT_NAME'),
          SortOrder: SORT_ORDER_PARAM_MAP[sort?.sortOrder ?? 'ASC'],
          Filters: filters?.length ? filters.join(',') : undefined,
          Fields: 'PrimaryImageAspectRatio,ChildCount,UserData',
          StartIndex: String(this.startIndexOfPage(page)),
          Limit: String(PAGE_SIZE),
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).map((item) => this.translateAudioItem(item)),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  /**
   * 专辑曲目：ParentId={albumId}&IncludeItemTypes=Audio&Recursive=true，数量级小不翻页。
   * 曲序用服务器原生曲号字段（盘号/曲号多键排序），不依赖曲名带序号前缀的命名习惯（05 §4.3）。
   */
  async getAlbumTracks(userId: string, albumId: string): Promise<AudioItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: albumId,
          IncludeItemTypes: 'Audio',
          Recursive: 'true',
          SortBy: 'ParentIndexNumber,IndexNumber,SortName',
          SortOrder: 'Ascending,Ascending,Ascending',
          Fields: 'PrimaryImageAspectRatio,UserData',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).map((item) => this.translateAudioItem(item));
  }

  /**
   * 艺术家的专辑网格：优先 AlbumArtistIds（专辑艺人维度，设计文档 §7.5）；
   * 为空时回退 ArtistIds（无 AlbumArtist 标签的音乐库，专辑只挂在曲目艺人上）。
   */
  async getArtistAlbums(
    userId: string,
    artistId: string,
    page: number
  ): Promise<Paged<MediaLibraryItem>> {
    const requestAlbums = (filterKey: 'AlbumArtistIds' | 'ArtistIds') =>
      this.api.request<ItemsResponse>({
        method: 'GET',
        url: this.urlOf(
          `/Users/${userId}/Items?${this.buildQuery({
            [filterKey]: artistId,
            IncludeItemTypes: 'MusicAlbum',
            Recursive: 'true',
            SortBy: 'SortName',
            SortOrder: 'Ascending',
            Fields: 'PrimaryImageAspectRatio,ChildCount',
            StartIndex: String(this.startIndexOfPage(page)),
            Limit: String(PAGE_SIZE),
            ImageTypeLimit: '1',
          })}`
        ),
        headers: this.buildHeaders(this.token),
      });
    const primary = await requestAlbums('AlbumArtistIds');
    // 仅首页做回退（艺人详情只消费首页；后续页沿用首次命中的维度）
    const data =
      (primary.Items ?? []).length > 0 || page > 0
        ? primary
        : await requestAlbums('ArtistIds');
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  /**
   * 艺术家热门歌曲：优先按「曲目艺人」ArtistIds 过滤（Emby Web 艺人页同口径；
   * 未写 AlbumArtist 标签的曲目只挂在 ArtistIds 上），为空再回退 AlbumArtistIds。
   * SortBy=PlayCount 降序 + Limit=HOT_SONGS_LIMIT。
   */
  async getArtistHotSongs(userId: string, artistId: string): Promise<AudioItem[]> {
    const requestSongs = (filterKey: 'AlbumArtistIds' | 'ArtistIds') =>
      this.api.request<ItemsResponse>({
        method: 'GET',
        url: this.urlOf(
          `/Users/${userId}/Items?${this.buildQuery({
            [filterKey]: artistId,
            IncludeItemTypes: 'Audio',
            Recursive: 'true',
            SortBy: 'PlayCount',
            SortOrder: 'Descending',
            Limit: String(HOT_SONGS_LIMIT),
            Fields: 'PrimaryImageAspectRatio,UserData',
            ImageTypeLimit: '1',
          })}`
        ),
        headers: this.buildHeaders(this.token),
      });
    const primary = await requestSongs('ArtistIds');
    const data =
      (primary.Items ?? []).length > 0 ? primary : await requestSongs('AlbumArtistIds');
    return (data.Items ?? []).map((item) => this.translateAudioItem(item));
  }

  /**
   * 歌单曲目：GET /Playlists/{playlistId}/Items?UserId={uid} 专用端点——
   * 保证歌单自定义顺序（而非 ParentId 查询的服务端默认排序，05 文档 §4.3）。
   */
  async getPlaylistItems(userId: string, playlistId: string): Promise<AudioItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Playlists/${playlistId}/Items?${this.buildQuery({
          UserId: userId,
          Fields: 'PrimaryImageAspectRatio,UserData',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).map((item) => this.translateAudioItem(item));
  }

  /**
   * 相册网格：ParentId={libraryId}&IncludeItemTypes=PhotoAlbum，封面 = 相册 Primary
   * （服务器自动取首图，设计文档 §7.6）；Fields=ChildCount 供「N 张」。
   */
  async getPhotoAlbums(
    userId: string,
    libraryId: string,
    page: number
  ): Promise<Paged<PhotoAlbumSummary>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: libraryId,
          IncludeItemTypes: 'PhotoAlbum',
          Recursive: 'true',
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          Fields: 'PrimaryImageAspectRatio,ChildCount',
          StartIndex: String(this.startIndexOfPage(page)),
          Limit: String(PAGE_SIZE),
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        if (translated === null) {
          return [];
        }
        const album: PhotoAlbumSummary = { ...translated, childCount: item.ChildCount ?? 0 };
        return [album];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  /**
   * 照片分页：IncludeItemTypes=Photo，三个 URL 按 widths 预拼
   * （grid/viewer/original，UI 拿到即用不感知拼接）；fileName 取 Path 的 basename
   * （缺失回退 name），只透传文件名、不透传完整服务器路径（05 文档 §4.2/§4.3）。
   * parentId 可传相册 id 或库 id（库 id + Recursive=true 即「全部图片」）；
   * sort 缺省按名称升序（库页排序菜单选择后由调用方传入）。
   */
  async getPhotos(
    userId: string,
    parentId: string,
    page: number,
    widths: { gridMaxWidth: number; viewerMaxWidth: number },
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<PhotoItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          ParentId: parentId,
          IncludeItemTypes: 'Photo',
          Recursive: 'true',
          SortBy: sortParamOf(this.flavor, sort?.sortBy ?? 'SORT_NAME'),
          SortOrder: SORT_ORDER_PARAM_MAP[sort?.sortOrder ?? 'ASC'],
          // Width/Height/DateCreated/PremiereDate：查看器副标题「日期 · 分辨率」与信息面板消费
          Fields: 'PrimaryImageAspectRatio,Path,Width,Height,DateCreated,PremiereDate',
          // 照片分页步长 = 照片页大小 60（与 Limit 一致，避免页间重叠）
          StartIndex: String(page * PHOTO_PAGE_SIZE),
          Limit: String(PHOTO_PAGE_SIZE),
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        const id = item.Id ?? '';
        if (translated === null || id === '') {
          return [];
        }
        const gridImageUrl = this.buildImageUrl(id, 'Primary', widths.gridMaxWidth);
        const viewerImageUrl = this.buildImageUrl(id, 'Primary', widths.viewerMaxWidth);
        const originalImageUrl = this.imageUrl(id, 'Primary');
        const fileName = basenameOf(item.Path);
        const takenAtMs = isoToMs(item.DateCreated) ?? isoToMs(item.PremiereDate);
        const photo: PhotoItem = {
          ...translated,
          width: item.Width,
          height: item.Height,
          fileName: fileName ?? translated.name,
          takenAtMs,
          gridImageUrl,
          viewerImageUrl,
          originalImageUrl,
        };
        return [photo];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? this.startIndexOfPage(page),
    };
  }

  // —— M8：库页 Tab 扩展（推荐/实体/LiveTV/插件频道/通用歌单）——

  /** 实体条目 → 统一实体摘要（Genres/Tags/Studios/Channels） */
  private translateEntity(item: EntityResponse): EntitySummary | null {
    const id = item.Id ?? item.Name ?? '';
    const name = item.Name ?? id;
    if (id === '' || name === '') {
      return null;
    }
    const tag = item.ImageTags?.Primary ?? item.PrimaryImageTag;
    return {
      id,
      name,
      imageUrl:
        tag !== undefined
          ? this.buildImageUrl(item.Id ?? id, 'Primary', POSTER_MAX_WIDTH, tag)
          : undefined,
      childCount: item.ChildCount,
    };
  }

  /** LiveTV/插件频道条目 → 统一模型（填充频道号/时间窗/状态） */
  private translateLiveItem(
    item: ServerItemResponse,
    type: 'TvChannel' | 'Program' | 'Recording' | 'Timer' | 'SeriesTimer'
  ): MediaLibraryItem | null {
    const id = item.Id ?? '';
    if (id === '') {
      return null;
    }
    const tag = item.ImageTags?.Primary ?? item.PrimaryImageTag;
    const imageId = item.PrimaryImageItemId ?? id;
    return {
      id,
      type,
      name: item.Name ?? '',
      subtext: item.ChannelName ?? item.Status,
      productionYear: item.ProductionYear,
      runtimeMs: item.RunTimeTicks !== undefined ? ticksToMs(item.RunTimeTicks) : undefined,
      posterImageUrl:
        tag !== undefined
          ? this.buildImageUrl(imageId, 'Primary', POSTER_MAX_WIDTH, tag)
          : undefined,
      channelNumber: item.ChannelNumber,
      channelId: item.ChannelId ?? (type === 'TvChannel' ? id : undefined),
      startMs: isoToMs(item.StartDate),
      endMs: isoToMs(item.EndDate),
      status: item.Status,
      userData: translateUserData(item),
    };
  }

  /** 类型 → 实体列表端点（音乐/游戏使用专用 Genres 端点） */
  private genreEndpointOf(kinds: readonly MediaItemTypeEnum[]): string {
    if (kinds.some((kind) => kind === 'Game' || kind === 'GameSystem')) {
      return '/GameGenres';
    }
    if (
      kinds.some((kind) => kind === 'MusicAlbum' || kind === 'Audio' || kind === 'MusicArtist')
    ) {
      return '/MusicGenres';
    }
    return '/Genres';
  }

  async getSuggestions(
    userId: string,
    parentId: string,
    kinds: readonly MediaItemTypeEnum[],
    limit: number
  ): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Suggestions?${this.buildQuery({
          ParentId: parentId,
          IncludeItemTypes: kinds.length > 0 ? kinds.join(',') : undefined,
          Limit: String(limit),
          Fields: 'PrimaryImageAspectRatio,UserData,ChildCount',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      return translated === null ? [] : [translated];
    });
  }

  async getGenres(
    userId: string,
    parentId: string,
    kinds: readonly MediaItemTypeEnum[],
    startIndex = 0,
    limit = PAGE_SIZE
  ): Promise<Paged<EntitySummary>> {
    const data = await this.api.request<EntityItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `${this.genreEndpointOf(kinds)}?${this.buildQuery({
          UserId: userId,
          ParentId: parentId,
          IncludeItemTypes: kinds.length > 0 ? kinds.join(',') : undefined,
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          StartIndex: String(startIndex),
          Limit: String(limit),
          Fields: 'PrimaryImageAspectRatio,ChildCount',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateEntity(item);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex,
    };
  }

  async getTags(
    userId: string,
    parentId: string,
    startIndex = 0,
    limit = PAGE_SIZE
  ): Promise<Paged<EntitySummary>> {
    const data = await this.api.request<EntityItemsResponse | string[]>({
      method: 'GET',
      url: this.urlOf(
        `/Tags?${this.buildQuery({
          UserId: userId,
          ParentId: parentId,
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          StartIndex: String(startIndex),
          Limit: String(limit),
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    const rawItems: EntityResponse[] = Array.isArray(data)
      ? data.map((name) => ({ Id: name, Name: name }))
      : (data.Items ?? []);
    const items = rawItems.flatMap((item) => {
      const translated = this.translateEntity(item);
      return translated === null ? [] : [translated];
    });
    return {
      items,
      total: Array.isArray(data) ? data.length : (data.TotalRecordCount ?? items.length),
      startIndex,
    };
  }

  async getStudios(
    userId: string,
    parentId: string,
    startIndex = 0,
    limit = PAGE_SIZE
  ): Promise<Paged<EntitySummary>> {
    const data = await this.api.request<EntityItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Studios?${this.buildQuery({
          UserId: userId,
          ParentId: parentId,
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          StartIndex: String(startIndex),
          Limit: String(limit),
          Fields: 'PrimaryImageAspectRatio,ChildCount',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateEntity(item);
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex,
    };
  }

  async getLiveTvChannels(
    userId: string,
    startIndex: number,
    limit: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/LiveTv/Channels?${this.buildQuery({
          UserId: userId,
          SortBy: sortParamOf(this.flavor, sort?.sortBy ?? 'SORT_NAME'),
          SortOrder: SORT_ORDER_PARAM_MAP[sort?.sortOrder ?? 'ASC'],
          StartIndex: String(startIndex),
          Limit: String(limit),
          Fields: 'PrimaryImageAspectRatio,UserData',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateLiveItem(item, 'TvChannel');
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex,
    };
  }

  async getLiveTvPrograms(
    userId: string,
    startIndex: number,
    limit: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/LiveTv/Programs?${this.buildQuery({
          UserId: userId,
          SortBy: sortParamOf(this.flavor, sort?.sortBy ?? 'START_DATE'),
          SortOrder: SORT_ORDER_PARAM_MAP[sort?.sortOrder ?? 'ASC'],
          StartIndex: String(startIndex),
          Limit: String(limit),
          Fields: 'PrimaryImageAspectRatio,UserData',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateLiveItem(item, 'Program');
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex,
    };
  }

  async getLiveTvRecordings(
    userId: string,
    startIndex: number,
    limit: number,
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<MediaLibraryItem>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/LiveTv/Recordings?${this.buildQuery({
          UserId: userId,
          SortBy: sortParamOf(this.flavor, sort?.sortBy ?? 'DATE_CREATED'),
          SortOrder: SORT_ORDER_PARAM_MAP[sort?.sortOrder ?? 'DESC'],
          StartIndex: String(startIndex),
          Limit: String(limit),
          Fields: 'PrimaryImageAspectRatio,UserData',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateLiveItem(item, 'Recording');
        return translated === null ? [] : [translated];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex,
    };
  }

  async getLiveTvTimers(userId: string): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse | ServerItemResponse[]>({
      method: 'GET',
      url: this.urlOf(`/LiveTv/Timers?${this.buildQuery({ UserId: userId })}`),
      headers: this.buildHeaders(this.token),
    });
    return itemsOf<ServerItemResponse>(data).items.flatMap((item) => {
      const translated = this.translateLiveItem(item, 'Timer');
      return translated === null ? [] : [translated];
    });
  }

  async getLiveTvSeriesTimers(userId: string): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse | ServerItemResponse[]>({
      method: 'GET',
      url: this.urlOf(`/LiveTv/SeriesTimers?${this.buildQuery({ UserId: userId })}`),
      headers: this.buildHeaders(this.token),
    });
    return itemsOf<ServerItemResponse>(data).items.flatMap((item) => {
      const translated = this.translateLiveItem(item, 'SeriesTimer');
      return translated === null ? [] : [translated];
    });
  }

  async getPluginChannels(userId: string): Promise<EntitySummary[]> {
    const data = await this.api.request<EntityItemsResponse | EntityResponse[]>({
      method: 'GET',
      url: this.urlOf(`/Channels?${this.buildQuery({ UserId: userId })}`),
      headers: this.buildHeaders(this.token),
    });
    return itemsOf<EntityResponse>(data).items.flatMap((item) => {
      const translated = this.translateEntity(item);
      return translated === null ? [] : [translated];
    });
  }

  async getPluginChannelItems(
    userId: string,
    channelId: string,
    startIndex: number,
    limit: number
  ): Promise<Paged<MediaLibraryItem>> {
    return this.listItems({ userId, channelId, startIndex, limit, recursive: true });
  }

  async getPlaylistEntries(userId: string, playlistId: string): Promise<MediaLibraryItem[]> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Playlists/${playlistId}/Items?${this.buildQuery({
          UserId: userId,
          Fields: 'PrimaryImageAspectRatio,UserData,ChildCount',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return (data.Items ?? []).flatMap((item) => {
      const translated = this.translateListItem(item);
      return translated === null ? [] : [translated];
    });
  }

  // —— M2/M3：播放决策与上报（共享实现；设计 §6.1 差异表未列为两端差异）——

  /**
   * 播放决策完整版（M3 文档 §4.5.1；设计文档 §8.1 流程）：
   * POST /Items/{itemId}/PlaybackInfo，body { UserId, MediaSourceId?, DeviceProfile, AudioStreamIndex?, SubtitleStreamIndex? }。
   * 源选取：传 MediaSourceId 时精确匹配（缺省回退第一个）；未传时沿用 M2「第一个可直连源」
   * （T2 直连回归口径不变），无可直连源取第一个（供转码分支判定）。
   * 决策：SupportsDirectPlay → 直连 URL（M2 构造不变）；否则 SupportsTranscoding 且
   * TranscodingUrl 非空 → {base}{TranscodingUrl}（只拼 baseUrl、不增删参数，服务器生成时已带
   * api_key/DeviceId/PlaySessionId）；两者皆否（含 SupportsTranscoding=true 但 URL 空的异常服务器）
   * 抛 PLAYBACK_UNSUPPORTED。
   */
  async resolvePlayback(
    userId: string,
    itemId: string,
    opts?: ResolvePlaybackOpts
  ): Promise<PlaybackSource> {
    // 档位缺省 = 无限制；profileInputs 由服务层组装（settingsStore + mediaCaps）
    const maxResolutionTier = opts?.maxResolutionTier ?? DEFAULT_RESOLUTION_TIER;
    const body: Record<string, unknown> = {
      UserId: userId,
      DeviceProfile: buildDeviceProfile({
        maxResolutionTier,
        allowHevcDirectPlay: opts?.profileInputs.allowHevcDirectPlay ?? true,
        decoderCaps: opts?.profileInputs.decoderCaps ?? {
          supportsHevcMain10: false,
          supportsVp9: false,
          supportsAv1: false,
        },
      }),
    };
    if (opts?.mediaSourceId !== undefined) {
      body.MediaSourceId = opts.mediaSourceId;
    }
    if (opts?.audioStreamIndex !== undefined) {
      body.AudioStreamIndex = opts.audioStreamIndex;
    }
    if (opts?.subtitleStreamIndex !== undefined) {
      body.SubtitleStreamIndex = opts.subtitleStreamIndex;
    }
    const data = await this.api.request<PlaybackInfoResponse>({
      method: 'POST',
      url: this.urlOf(`/Items/${itemId}/PlaybackInfo`),
      headers: this.buildHeaders(this.token),
      body,
    });
    const rawList = data.MediaSources ?? [];
    const rawSource =
      opts?.mediaSourceId !== undefined
        ? (rawList.find((source) => source.Id === opts.mediaSourceId) ?? rawList[0])
        : (rawList.find((source) => source.SupportsDirectPlay) ?? rawList[0]);
    // 播放 URL 的 api_key 必须是登录 token（getActiveAdapter 保证登录后才有实例）
    if (!this.token || rawSource === undefined || data.PlaySessionId === undefined) {
      throw new AppError('PLAYBACK_UNSUPPORTED');
    }
    const mediaSourceId = rawSource.Id ?? '';
    const runTimeMs = rawSource.RunTimeTicks !== undefined ? ticksToMs(rawSource.RunTimeTicks) : undefined;
    // MediaStreams 翻译（03 §4.5.1 第 3/4 条）：直连与转码均携带（字幕菜单/音轨菜单数据源）
    const subtitleList = this.translateSubtitleTracks(rawSource, itemId);
    const audioList = translateAudioTracks(rawSource);
    const positionMsAtStart = opts?.startPositionMs ?? 0;
    // 源视频尺寸（分辨率菜单据此隐藏高于源的档位；缺失时菜单展示全部档位）
    const videoStream = rawSource.MediaStreams?.find((stream) => stream.Type === 'Video');
    const base = {
      playSessionId: data.PlaySessionId,
      itemId,
      mediaSourceId,
      positionMsAtStart,
      runTimeMs,
      subtitleList,
      audioList,
      sourceWidth: videoStream?.Width,
      sourceHeight: videoStream?.Height,
    };

    // 直连分支（M2 既有构造，不变）
    if (rawSource.SupportsDirectPlay) {
      const url =
        `${this.baseUrl}/Videos/${itemId}/stream?static=true` +
        `&MediaSourceId=${encodeURIComponent(mediaSourceId)}&api_key=${encodeURIComponent(this.token)}`;
      return { ...base, playMethod: 'DirectPlay', url };
    }
    // 转码分支（M3）：TranscodingUrl 由服务器生成（含 api_key/PlaySessionId），客户端只拼 baseUrl
    if (rawSource.SupportsTranscoding && rawSource.TranscodingUrl) {
      const url = `${this.baseUrl}${rawSource.TranscodingUrl}`;
      return { ...base, playMethod: 'Transcode', url, maxResolutionTier };
    }
    // SupportsTranscoding=true 但 TranscodingUrl 为空（异常服务器）同按无法播放处理
    throw new AppError('PLAYBACK_UNSUPPORTED');
  }

  /**
   * 字幕轨翻译（03 §4.5.1 第 3/4 条）：DeliveryMethod 服务器判定为准（Encode→burnIn、
   * External→isExternal），不在客户端按格式猜；vttUrl 仅外挂文本轨产出。
   */
  private translateSubtitleTracks(source: MediaSourceInfoResponse, itemId: string): SubtitleTrack[] {
    const mediaSourceId = source.Id ?? '';
    return (source.MediaStreams ?? []).flatMap((stream) => {
      if (stream.Type !== 'Subtitle' || stream.Index === undefined) {
        return [];
      }
      const streamIndex = stream.Index;
      const burnIn = stream.DeliveryMethod === 'Encode';
      const isExternal = stream.DeliveryMethod === 'External';
      const track: SubtitleTrack = {
        streamIndex,
        language: stream.Language,
        // 轨道名回退交由 UI 侧本地化（无标题时 SubtitleMenu 用 player.subtitleFallback）
        title: stream.DisplayTitle ?? stream.Title ?? stream.Language,
        format: stream.Codec,
        isExternal,
        isForced: stream.IsForced,
        isDefault: stream.IsDefault,
        burnIn,
      };
      if (isExternal && !burnIn) {
        track.vttUrl = this.resolveVttUrl(itemId, mediaSourceId, streamIndex, stream.DeliveryUrl);
      }
      return [track];
    });
  }

  /**
   * 外挂 vtt 完整 URL 三分支（03 §4.5.1 第 4 条）：
   * DeliveryUrl 缺省 → buildSubtitleUrl 兜底（恒含 api_key）；
   * 有 DeliveryUrl → 拼 baseUrl（绝对 URL 防御性原样），query 已含 api_key 原样保留（不重复追加）、
   * 缺则补齐——播放器请求不经 axios，凭证只能进 URL。
   */
  private resolveVttUrl(
    itemId: string,
    mediaSourceId: string,
    streamIndex: number,
    deliveryUrl?: string
  ): string {
    if (!deliveryUrl) {
      return this.buildSubtitleUrl(itemId, mediaSourceId, streamIndex);
    }
    const url = deliveryUrl.startsWith('http') ? deliveryUrl : `${this.baseUrl}${deliveryUrl}`;
    if (/[?&]api_key=/.test(url)) {
      return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(this.token ?? '')}`;
  }

  /** 上报公共 body（02 §4.3）：PositionTicks 由 msToTicks 换算，服务层只管毫秒 */
  private reportBody(args: ReportArgs): Record<string, unknown> {
    const body: Record<string, unknown> = {
      ItemId: args.itemId,
      PlaySessionId: args.playSessionId,
      MediaSourceId: args.mediaSourceId,
      PositionTicks: msToTicks(args.positionMs),
    };
    // M5（05 文档 §4.2）：playMethod 为 "Universal" 时 body 不含 PlayMethod 字段——
    // 客户端不知道服务器实际选了直连还是转码，不谎报
    if (args.playMethod !== undefined && args.playMethod !== 'Universal') {
      body.PlayMethod = args.playMethod;
    }
    if (args.isPaused !== undefined) {
      body.IsPaused = args.isPaused;
    }
    return body;
  }

  /** Playing 事件：POST /Sessions/Playing（播放器加载成功后调，02 §4.3） */
  async reportPlaying(args: ReportArgs): Promise<void> {
    await this.api.request({
      method: 'POST',
      url: this.urlOf('/Sessions/Playing'),
      headers: this.buildHeaders(this.token),
      body: this.reportBody(args),
    });
  }

  /** Progress 事件：POST /Sessions/Playing/Progress（10s 节流 + 即时，02 §4.3） */
  async reportProgress(args: ReportArgs): Promise<void> {
    await this.api.request({
      method: 'POST',
      url: this.urlOf('/Sessions/Playing/Progress'),
      headers: this.buildHeaders(this.token),
      body: this.reportBody(args),
    });
  }

  /** Stopped 事件：POST /Sessions/Stopped（退出/播完调，body 同 Playing，02 §4.3） */
  async reportStopped(args: ReportArgs): Promise<void> {
    await this.api.request({
      method: 'POST',
      url: this.urlOf('/Sessions/Stopped'),
      headers: this.buildHeaders(this.token),
      body: this.reportBody(args),
    });
  }

  // —— M2：已看（mark/unmark 成对式，02 §4.3；设计文档 §7.3）——

  /** 手动标已看：POST /Users/{userId}/PlayedItems/{itemId} */
  async markPlayed(userId: string, itemId: string): Promise<void> {
    await this.api.request({
      method: 'POST',
      url: this.urlOf(`/Users/${userId}/PlayedItems/${itemId}`),
      headers: this.buildHeaders(this.token),
    });
  }

  /** 手动取消已看：DELETE /Users/{userId}/PlayedItems/{itemId} */
  async unmarkPlayed(userId: string, itemId: string): Promise<void> {
    await this.api.request({
      method: 'DELETE',
      url: this.urlOf(`/Users/${userId}/PlayedItems/${itemId}`),
      headers: this.buildHeaders(this.token),
    });
  }

  /**
   * M3：外挂字幕 vtt URL（03 §4.5.2；设计文档 §6.1 字幕流行）。
   * {base}/Videos/{itemId}/{mediaSourceId}/Subtitles/{streamIndex}/Stream.vtt?api_key={token}
   * 播放器请求不走 axios，必须带 api_key；双服务器联调与 DeliveryUrl 对照（路径有出入时差异覆写）。
   */
  buildSubtitleUrl(itemId: string, mediaSourceId: string, streamIndex: number): string {
    return (
      `${this.baseUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${streamIndex}/Stream.vtt` +
      `?api_key=${encodeURIComponent(this.token ?? '')}`
    );
  }

  /**
   * M3：停止转码会话（03 §4.5.3；设计文档 §8.3）——DELETE /Videos/ActiveEncodings。
   * 共享骨架：构造 DELETE 请求；query 参数名由子类覆写 activeEncodingsQueryKey()
   * （Jellyfin=playSessionId / Emby=id）。失败吞错仅记日志——清理必须幂等且不阻塞收尾流程，
   * 残留会话由服务器播放会话超时回收。
   */
  async stopTranscodingSession(playSessionId: string): Promise<void> {
    try {
      await this.api.request({
        method: 'DELETE',
        url: this.urlOf(
          `/Videos/ActiveEncodings?${this.activeEncodingsQueryKey()}=${encodeURIComponent(playSessionId)}`
        ),
        headers: this.buildHeaders(this.token),
      });
    } catch {
      // 幂等吞错（03 §4.5.3 / §4.11：清理请求失败不阻塞收尾，含 401 登出场景）
      console.warn('[adapter] 停止转码会话请求失败（幂等忽略）');
    }
  }

  // —— M6：Quick Connect（06 文档 §4.3.1；设计文档 §6.1「两端点行为一致」→ BaseAdapter 共享实现）——

  /**
   * Quick Connect 是否启用：GET /QuickConnect/Enabled（免认证，带设备头）。
   * 响应为裸 bool（Jellyfin 官方控制器形态）；防御性兼容 { value } 包装形态。
   */
  async isQuickConnectEnabled(): Promise<boolean> {
    const data = await this.api.request<boolean | { value?: boolean }>({
      method: 'GET',
      url: this.urlOf('/QuickConnect/Enabled'),
      headers: this.buildHeaders(),
    });
    return data === true || (typeof data === 'object' && data !== null && data.value === true);
  }

  /**
   * 发起 Quick Connect：POST /QuickConnect/Initiate（免认证，无 body）。
   * 响应 QuickConnectResult 取 Code（6 位）/Secret/FriendlyName；服务器禁用时 401 →
   * QUICK_CONNECT_DISABLED（401 语义是「未启用 QC」而非 Token 失效，skipUnauthorizedEmit
   * 抑制全局登出事件，避免「为已有服务器添加用户」上下文被误登出）。
   */
  async initiateQuickConnect(): Promise<QuickConnectSession> {
    let data: QuickConnectResultResponse;
    try {
      data = await this.api.request<QuickConnectResultResponse>({
        method: 'POST',
        url: this.urlOf('/QuickConnect/Initiate'),
        headers: this.buildHeaders(),
        skipUnauthorizedEmit: true,
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'UNAUTHORIZED') {
        throw new AppError('QUICK_CONNECT_DISABLED', { httpStatus: 401, cause: err });
      }
      throw err;
    }
    if (data.Code === undefined || data.Secret === undefined) {
      // 服务器异常响应形态（缺授权码/凭据），按未知错误归一
      throw new AppError('UNKNOWN');
    }
    const session: QuickConnectSession = { code: data.Code, secret: data.Secret };
    if (data.FriendlyName !== undefined) {
      session.friendlyName = data.FriendlyName;
    }
    return session;
  }

  /**
   * 轮询授权状态：GET /QuickConnect/Connect?secret={secret}（免认证）。
   * Authenticated=true 即已授权；404（secret 过期/不存在）→ QUICK_CONNECT_EXPIRED（按超时处理），
   * 同样以 skipUnauthorizedEmit 免认证语义处理（若服务器以 401 表达过期）。
   */
  async pollQuickConnect(secret: string): Promise<QuickConnectState> {
    let data: QuickConnectResultResponse;
    try {
      data = await this.api.request<QuickConnectResultResponse>({
        method: 'GET',
        url: this.urlOf(`/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`),
        headers: this.buildHeaders(),
        skipUnauthorizedEmit: true,
      });
    } catch (err) {
      if (err instanceof AppError && (err.code === 'NOT_FOUND' || err.code === 'UNAUTHORIZED')) {
        // 404 → 授权码已失效（06 §4.3.1 表：按超时处理）
        throw new AppError('QUICK_CONNECT_EXPIRED', { httpStatus: err.httpStatus, cause: err });
      }
      throw err;
    }
    return { authenticated: data.Authenticated === true };
  }

  /**
   * 授权后换取 Token：POST /Users/AuthenticateWithQuickConnect，body { Secret }。
   * 响应 AuthenticationResult（AccessToken + User）翻译为 M1 AuthResult（与密码登录同构）；
   * 此后的 Token 注入/Authorization 头策略复用各 Adapter 既有差异实现（buildHeaders）。
   * 该请求走登录端点语义（401 → LOGIN_FAILED 文案归一），未抑制事件（登录页无活跃会话可失效）。
   */
  async loginWithQuickConnect(secret: string): Promise<AuthResult> {
    const data = await this.api.request<AuthenticateByNameResponse>({
      method: 'POST',
      url: this.urlOf('/Users/AuthenticateWithQuickConnect'),
      headers: this.buildHeaders(),
      body: { Secret: secret },
    });
    const user = data.User;
    if (!data.AccessToken || !user?.Id) {
      // 理论不可达（服务器异常响应形态）；按未知错误归一
      throw new AppError('UNKNOWN');
    }
    const auth: AuthResult = {
      userId: user.Id,
      userName: user.Name ?? '',
      token: data.AccessToken,
      serverId: data.ServerId ?? '',
    };
    if (user.PrimaryImageTag) {
      const params = new URLSearchParams({
        maxWidth: String(AVATAR_MAX_WIDTH),
        tag: user.PrimaryImageTag,
      });
      auth.avatarUrl = `${this.urlOf(`/Users/${user.Id}/Images/Primary`)}?${params.toString()}`;
    }
    return auth;
  }

  /**
   * 观看历史（06 文档 §4.3.1 端点映射表）：GET /Users/{uid}/Items，已看条目按观看时间倒序。
   * Filters=IsPlayed + SortBy=DatePlayed + SortOrder=Descending + IncludeItemTypes={设置页多选}
   * + Recursive=true + StartIndex/Limit（分页沿用海报墙步长口径，页大小由调用方传入）。
   */
  async getWatchHistory(userId: string, query: HistoryQuery): Promise<Paged<HistoryEntry>> {
    const data = await this.api.request<ItemsResponse>({
      method: 'GET',
      url: this.urlOf(
        `/Users/${userId}/Items?${this.buildQuery({
          IncludeItemTypes: query.includeItemTypes.join(','),
          Filters: 'IsPlayed',
          SortBy: 'DatePlayed',
          SortOrder: 'Descending',
          Recursive: 'true',
          StartIndex: String(query.startIndex),
          Limit: String(query.limit),
          Fields: 'PrimaryImageAspectRatio',
          ImageTypeLimit: '1',
        })}`
      ),
      headers: this.buildHeaders(this.token),
    });
    return {
      items: (data.Items ?? []).flatMap((item) => {
        const translated = this.translateListItem(item);
        if (translated === null) {
          return [];
        }
        const entry: HistoryEntry = { ...translated };
        const lastPlayedAtMs = isoToMs(item.UserData?.LastPlayedDate);
        if (lastPlayedAtMs !== undefined) {
          entry.lastPlayedAtMs = lastPlayedAtMs;
        }
        if (item.SeriesName !== undefined) {
          entry.seriesName = item.SeriesName;
        }
        if (item.ParentIndexNumber !== undefined) {
          entry.parentIndexNumber = item.ParentIndexNumber;
        }
        if (item.IndexNumber !== undefined) {
          entry.indexNumber = item.IndexNumber;
        }
        return [entry];
      }),
      total: data.TotalRecordCount ?? 0,
      startIndex: data.StartIndex ?? query.startIndex,
    };
  }

  /**
   * 歌词（06 文档 §4.3.1/§4.6.3）：GET /Audio/{itemId}/Lyrics（需认证）。
   * 404/无歌词 → null（Emby 端点未公开实证，404 一律优雅降级为「暂无歌词」）；
   * 响应 LyricDto.Lyrics[] 逐行取 Text，StartTick 经 ticksToMs 换算为 startMs
   * （Ticks=100ns，与播放进度同一换算函数）；无 StartTick 的行为纯文本行（startMs 缺省）。
   * 异常不抛出（除 404 外的网络/服务器错误也降级为 null，功能无损）。
   */
  async getLyrics(userId: string, itemId: string): Promise<LyricLine[] | null> {
    let data: LyricDtoResponse;
    try {
      data = await this.api.request<LyricDtoResponse>({
        method: 'GET',
        url: this.urlOf(`/Audio/${itemId}/Lyrics?${this.buildQuery({ userId })}`),
        headers: this.buildHeaders(this.token),
      });
    } catch (err) {
      // 404 = 无歌词/端点不存在（Emby 未实证场景）；其余异常同样降级，不阻塞播放
      if (err instanceof AppError && err.code === 'NOT_FOUND') {
        return null;
      }
      console.warn('[adapter] 歌词获取失败（降级为暂无歌词）');
      return null;
    }
    const lines = data.Lyrics ?? [];
    if (lines.length === 0) {
      return null;
    }
    return lines.map((line) => {
      const lyric: LyricLine = { text: line.Text ?? '' };
      const startTick = line.StartTick ?? line.Start;
      if (typeof startTick === 'number') {
        lyric.startMs = ticksToMs(startTick);
      }
      return lyric;
    });
  }
}

/** QuickConnectResult 响应原始形态（Initiate/Connect 共用；06 文档 §4.3.1） */
interface QuickConnectResultResponse {
  Code?: string;
  Secret?: string;
  FriendlyName?: string;
  Authenticated?: boolean;
}

/** LyricDto 响应原始形态（Jellyfin 10.9+；StartTick 为 Ticks，兼容 Start 字段名变体） */
interface LyricDtoResponse {
  Lyrics?: { Text?: string; StartTick?: number; Start?: number }[];
}
