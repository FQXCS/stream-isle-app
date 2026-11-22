/**
 * 库页扩展查询服务（推荐/实体列表/LiveTV/插件频道/通用歌单）：
 * 统一取活跃账号 userId 与 adapter；实体/直播类加 3 分钟内存 TTL + 在途去重，
 * 海报墙仍由 browseStore 缓存（本文件不重复缓存分页墙）。
 */
import type {
  EntitySummary,
  MediaItemTypeEnum,
  MediaLibraryItem,
  Paged,
  SortByEnum,
} from '@/adapter/model';
import { PAGE_SIZE } from '@/constant/browse';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

const CACHE_TTL_MS = 3 * 60 * 1000;

interface CacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** 清空内存缓存（账号切换/测试用；键含 userId，正常使用无需手动清） */
export function clearLibraryBrowseCache(): void {
  cache.clear();
}

function cached<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return hit.value as Promise<T>;
  }
  const value = factory().catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 LibraryBrowseService');
  }
  return active.userId;
}

/** 推荐：优先 Suggestions；端点不可用时回退「最新添加」 */
export function loadSuggestions(
  parentId: string,
  kinds: readonly MediaItemTypeEnum[],
  limit = PAGE_SIZE
): Promise<MediaLibraryItem[]> {
  const userId = requireUserId();
  const adapter = getActiveAdapter();
  const key = `suggestions:${userId}:${parentId}:${kinds.join(',')}:${limit}`;
  return cached(key, async () => {
    try {
      return await adapter.getSuggestions(userId, parentId, kinds, limit);
    } catch {
      const page = await adapter.listItems({
        userId,
        parentId,
        kinds: kinds.length > 0 ? [...kinds] : undefined,
        sortBy: 'DATE_CREATED',
        sortOrder: 'DESC',
        startIndex: 0,
        limit,
      });
      return page.items;
    }
  });
}

export type EntityListKind =
  | 'genres'
  | 'tags'
  | 'studios'
  | 'pluginChannels'
  | 'gameSystems';

/** 实体列表分页（Genres/Tags/Studios/PluginChannels/GameSystems；后两者一次性返回） */
export function loadEntityPage(
  kind: EntityListKind,
  parentId: string,
  kinds: readonly MediaItemTypeEnum[],
  page: number
): Promise<Paged<EntitySummary>> {
  const userId = requireUserId();
  const adapter = getActiveAdapter();
  const key = `entity:${kind}:${userId}:${parentId}:${kinds.join(',')}:${page}`;
  return cached(key, async () => {
    if (kind === 'genres') {
      return adapter.getGenres(userId, parentId, kinds, page * PAGE_SIZE, PAGE_SIZE);
    }
    if (kind === 'tags') {
      return adapter.getTags(userId, parentId, page * PAGE_SIZE, PAGE_SIZE);
    }
    if (kind === 'studios') {
      return adapter.getStudios(userId, parentId, page * PAGE_SIZE, PAGE_SIZE);
    }
    if (kind === 'gameSystems') {
      const result = await adapter.listItems({
        userId,
        parentId,
        kinds: ['GameSystem'],
        sortBy: 'SORT_NAME',
        sortOrder: 'ASC',
        startIndex: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      return {
        items: result.items.map((item) => ({
          id: item.id,
          name: item.name,
          imageUrl: item.posterImageUrl,
          childCount: item.childCount,
        })),
        total: result.total,
        startIndex: result.startIndex,
      };
    }
    const items = await adapter.getPluginChannels(userId);
    return { items, total: items.length, startIndex: 0 };
  });
}

export type LiveListKind = 'channels' | 'programs' | 'recordings' | 'timers' | 'seriesTimers';

/** LiveTV 列表分页（Timers/SeriesTimers 一次性返回；排序只对前三种生效） */
export function loadLiveTvPage(
  kind: LiveListKind,
  page: number,
  sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
): Promise<Paged<MediaLibraryItem>> {
  const userId = requireUserId();
  const adapter = getActiveAdapter();
  const sortKey = sort !== undefined ? `${sort.sortBy}:${sort.sortOrder}` : '';
  const key = `live:${kind}:${userId}:${page}:${sortKey}`;
  return cached(key, async () => {
    if (kind === 'channels') {
      return adapter.getLiveTvChannels(userId, page * PAGE_SIZE, PAGE_SIZE, sort);
    }
    if (kind === 'programs') {
      return adapter.getLiveTvPrograms(userId, page * PAGE_SIZE, PAGE_SIZE, sort);
    }
    if (kind === 'recordings') {
      return adapter.getLiveTvRecordings(userId, page * PAGE_SIZE, PAGE_SIZE, sort);
    }
    if (kind === 'timers') {
      const items = await adapter.getLiveTvTimers(userId);
      return { items, total: items.length, startIndex: 0 };
    }
    const items = await adapter.getLiveTvSeriesTimers(userId);
    return { items, total: items.length, startIndex: 0 };
  });
}

/** 通用歌单条目（视频/音频混合；音频播放队列仍走 getPlaylistItems） */
export function loadPlaylistEntries(playlistId: string): Promise<MediaLibraryItem[]> {
  const userId = requireUserId();
  const adapter = getActiveAdapter();
  return cached(`playlist:${userId}:${playlistId}`, () =>
    adapter.getPlaylistEntries(userId, playlistId)
  );
}

/**
 * 歌单条目缓存失效（音乐个人歌单文档 §5.5）：歌单的移除/排序/重命名/删除等
 * 变更操作成功后必须调用，否则详情页 TTL 内回显脏数据。键含 userId，
 * 无活跃账号时无键可失效（静默返回）。
 */
export function invalidatePlaylistCache(playlistId: string): void {
  const active = useAccountStore.getState().active;
  if (!active) {
    return;
  }
  cache.delete(`playlist:${active.userId}:${playlistId}`);
}
