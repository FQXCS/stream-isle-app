/**
 * 浏览服务（M1 文档 §4.7）：库列表 / 海报墙分页，面向当前活跃账号。
 * M5 增量：音乐四区查询封装（专辑/艺术家/歌单/全部歌曲）。
 * M6 增量：观看历史分页（06 文档 §2.1「观看历史」行）。
 */
import type {
  AudioItem,
  HistoryEntry,
  ItemQuery,
  MediaLibrary,
  MediaLibraryItem,
  Paged,
} from '@/adapter/model';
import { PAGE_SIZE } from '@/constant/browse';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

/**
 * 库列表：adapter.getUserViews → Promise.all(每库 getLibraryItemCount) 填 itemCount
 * （库数个位数，一次性并发可接受）。数量口径与海报墙一致（§4.6.3）。
 */
export async function fetchLibraries(): Promise<MediaLibrary[]> {
  const state = useAccountStore.getState();
  const active = state.active;
  if (!active) {
    // 与 getActiveAccount 同层级的时序断言（UI 路由守卫应已拦截）
    throw new Error('时序错误：无活跃账号时不应调用 fetchLibraries()');
  }
  const adapter = getActiveAdapter();
  const libraries = await adapter.getUserViews(active.userId);
  // 逐库补数量（并发；collectionType 传入供数量口径判定）
  await Promise.all(
    libraries.map(async (library) => {
      const count = await adapter.getLibraryItemCount(
        active.userId,
        library.id,
        library.collectionType
      );
      library.itemCount = count;
    })
  );
  return libraries;
}

/**
 * 海报墙分页：adapter.listItems（服务端分页，步长 PAGE_SIZE=40）。
 */
export async function fetchWallPage(query: ItemQuery): Promise<Paged<MediaLibraryItem>> {
  const adapter = getActiveAdapter();
  return adapter.listItems(query);
}

// —— M5：音乐四区查询封装（页码从 0 起，服务端分页步长见 adapter）——

/** 专辑区 */
export function fetchMusicAlbums(libraryId: string, page: number): Promise<Paged<MediaLibraryItem>> {
  return getActiveAdapter().getMusicAlbums(requireUserId(), libraryId, page);
}

/** 艺术家区 */
export function fetchMusicArtists(libraryId: string, page: number): Promise<Paged<MediaLibraryItem>> {
  return getActiveAdapter().getMusicArtists(requireUserId(), libraryId, page);
}

/** 歌单区（不带 ParentId，查全量歌单） */
export function fetchMusicPlaylists(page: number): Promise<Paged<MediaLibraryItem>> {
  return getActiveAdapter().getMusicPlaylists(requireUserId(), page);
}

/** 全部歌曲区 */
export function fetchAllSongs(libraryId: string, page: number): Promise<Paged<AudioItem>> {
  return getActiveAdapter().getAllSongs(requireUserId(), libraryId, page);
}

/** 取活跃 userId（UI 路由守卫保证有活跃账号） */
function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 BrowseService 音乐查询');
  }
  return active.userId;
}

// —— M6：观看历史（06 文档 §4.3.1 getWatchHistory 行）——

/**
 * 观看历史分页（服务端已看条目按 DatePlayed 倒序）：页码从 0 起，
 * 步长复用海报墙 PAGE_SIZE=40（06 文档 §4.3.1「分页沿用海报墙 StartIndex/Limit」）。
 */
export function loadHistory(page: number): Promise<Paged<HistoryEntry>> {
  return getActiveAdapter().getWatchHistory(requireUserId(), {
    startIndex: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
}
