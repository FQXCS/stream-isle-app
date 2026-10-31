/**
 * 详情服务（M2 文档 §4.5）：详情页/人物页数据编排。
 * 经 getActiveAdapter() 调用 adapter，不直接发请求；userId 从 accountStore 读取。
 */
import type {
  AlbumDetailModel,
  ArtistDetailModel,
  EpisodeItem,
  MediaDetail,
  MediaLibraryItem,
  SeasonItem,
} from '@/adapter/model';
import { ALBUM_GRID_COVER_MAX_WIDTH, AUDIO_ARTWORK_MAX_WIDTH } from '@/constant/audio';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

/** 取活跃 userId（UI 路由守卫保证有活跃账号；缺席位属时序编程错误，直接断言抛出） */
function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 DetailService');
  }
  return active.userId;
}

export class DetailService {
  /** 详情主数据（电影/剧集/人物条目共用） */
  async loadDetail(itemId: string): Promise<MediaDetail> {
    const adapter = getActiveAdapter();
    return adapter.getItemDetail(requireUserId(), itemId);
  }

  /** 季列表（adapter 已按季号升序，缺失/0 排最后） */
  async loadSeasons(seriesId: string): Promise<SeasonItem[]> {
    const adapter = getActiveAdapter();
    return adapter.getSeasons(requireUserId(), seriesId);
  }

  /** 单季集列表（Fields=Overview 供集卡片单行简介） */
  async loadEpisodes(seriesId: string, seasonId: string): Promise<EpisodeItem[]> {
    const adapter = getActiveAdapter();
    return adapter.getEpisodes(requireUserId(), seriesId, seasonId);
  }

  /** 相似推荐（上限 SIMILAR_LIMIT，adapter 侧已限制） */
  async loadSimilar(itemId: string): Promise<MediaLibraryItem[]> {
    const adapter = getActiveAdapter();
    return adapter.getSimilar(requireUserId(), itemId);
  }

  /** 人物页一次拉齐：人物详情（Person 条目）+ 出演作品 */
  async loadPerson(
    personId: string
  ): Promise<{ person: MediaDetail; filmographyList: MediaLibraryItem[] }> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    const [person, filmographyList] = await Promise.all([
      adapter.getItemDetail(userId, personId),
      adapter.getPersonFilmography(userId, personId),
    ]);
    return { person, filmographyList };
  }

  // —— M5：专辑/歌单/艺术家详情（05 文档 §4.12）——

  /** 专辑详情：getItemDetail + getAlbumTracks（封面/艺人/年份/曲目列表） */
  async loadAlbum(albumId: string): Promise<AlbumDetailModel> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    const [detail, trackList] = await Promise.all([
      adapter.getItemDetail(userId, albumId),
      adapter.getAlbumTracks(userId, albumId),
    ]);
    return {
      id: albumId,
      kind: 'album',
      name: detail.name,
      // 专辑艺人取曲目 AlbumArtist（MediaDetail 无该字段）；空专辑无艺人行
      artistName: trackList[0]?.artistName,
      productionYear: detail.productionYear,
      coverImageUrl: adapter.imageUrl(albumId, 'Primary', AUDIO_ARTWORK_MAX_WIDTH),
      trackList,
    };
  }

  /** 歌单详情：getItemDetail + getPlaylistItems（专用端点保序，A4） */
  async loadPlaylist(playlistId: string): Promise<AlbumDetailModel> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    const [detail, trackList] = await Promise.all([
      adapter.getItemDetail(userId, playlistId),
      adapter.getPlaylistItems(userId, playlistId),
    ]);
    return {
      id: playlistId,
      kind: 'playlist',
      name: detail.name,
      productionYear: detail.productionYear,
      coverImageUrl: adapter.imageUrl(playlistId, 'Primary', AUDIO_ARTWORK_MAX_WIDTH),
      trackList,
    };
  }

  /**
   * 艺术家详情：getItemDetail + getArtistAlbums（专辑网格）+ getArtistHotSongs（热门歌曲）并发。
   * 专辑网格封面沿用列表翻译的 posterImageUrl（POSTER_MAX_WIDTH=400 = ALBUM_GRID_COVER_MAX_WIDTH 口径）。
   */
  async loadArtist(artistId: string): Promise<ArtistDetailModel> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    const [detail, albumPage, hotSongList] = await Promise.all([
      adapter.getItemDetail(userId, artistId),
      adapter.getArtistAlbums(userId, artistId, 0),
      adapter.getArtistHotSongs(userId, artistId),
    ]);
    return {
      id: artistId,
      name: detail.name,
      avatarImageUrl: adapter.imageUrl(artistId, 'Primary', ALBUM_GRID_COVER_MAX_WIDTH),
      overview: detail.overview,
      albumList: albumPage.items,
      hotSongList,
    };
  }
}

/** 全局单例 */
export const detailService = new DetailService();
