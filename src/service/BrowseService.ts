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
  SortByEnum,
} from '@/adapter/model';
import { PAGE_SIZE } from '@/constant/browse';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';

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

// —— M5：音乐查询封装（页码从 0 起，服务端分页步长见 adapter）——

/** 艺术家区 */
export function fetchMusicArtists(libraryId: string, page: number): Promise<Paged<MediaLibraryItem>> {
  return getActiveAdapter().getMusicArtists(requireUserId(), libraryId, page);
}

/** 全部歌曲区 */
export function fetchAllSongs(libraryId: string, page: number): Promise<Paged<AudioItem>> {
  return getActiveAdapter().getAllSongs(requireUserId(), libraryId, page);
}

/**
 * 文件夹区（目录浏览）：Items?Recursive=false 只列当前目录的子文件夹与条目；
 * 排序缺省名称升序（库页排序菜单选择后由调用方传入），分页步长复用海报墙 PAGE_SIZE。
 */
export function fetchFolderPage(
  parentId: string,
  page: number,
  sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
): Promise<Paged<MediaLibraryItem>> {
  return fetchWallPage({
    userId: requireUserId(),
    parentId,
    sortBy: sort?.sortBy ?? 'SORT_NAME',
    sortOrder: sort?.sortOrder ?? 'ASC',
    recursive: false,
    startIndex: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
}

/**
 * 文件夹封面取样：服务器不给 Folder 图片（/Images/Primary 为 404），
 * 递归取目录内前 searchLimit 个「自带海报」类型（照片/视频/影片/剧集/图书/专辑）的条目，
 * 由调用方挑第一个带海报的作封面——照片库的下一层是相册（相册无图），必须递归才能拿到照片。
 */
export function fetchFolderPreview(
  parentId: string,
  searchLimit = 5
): Promise<Paged<MediaLibraryItem>> {
  return fetchWallPage({
    userId: requireUserId(),
    parentId,
    kinds: ['Movie', 'Series', 'Video', 'Photo', 'Book', 'MusicAlbum'],
    sortBy: 'SORT_NAME',
    sortOrder: 'ASC',
    recursive: true,
    startIndex: 0,
    limit: searchLimit,
  });
}

/**
 * 照片库「视频」段：家庭视频/照片混合库内 Video 条目的平铺分页。
 */
export function fetchVideoPage(
  libraryId: string,
  page: number,
  sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
): Promise<Paged<MediaLibraryItem>> {
  return fetchWallPage({
    userId: requireUserId(),
    parentId: libraryId,
    kinds: ['Video'],
    sortBy: sort?.sortBy ?? 'SORT_NAME',
    sortOrder: sort?.sortOrder ?? 'ASC',
    startIndex: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
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
 * 收录类型由设置页二级页单独配置（默认 Movie,Episode,Video）。
 */
export function loadHistory(page: number): Promise<Paged<HistoryEntry>> {
  return getActiveAdapter().getWatchHistory(requireUserId(), {
    startIndex: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    includeItemTypes: useSettingsStore.getState().historyTypeList,
  });
}
