/**
 * 浏览 store（M1 文档 §4.8）：库列表 + 海报墙分页缓存。
 * 不持久化（设计文档 §9：杀 App 重进重新拉取列表），按 serverId:userId 隔离。
 */
import { create } from 'zustand';

import type { AppErrorCode } from '@/infra/error';
import type { ItemQuery, MediaLibrary, MediaLibraryItem, Paged } from '@/adapter/model';
import { fetchLibraries, fetchWallPage } from '@/service/BrowseService';

/** 海报墙分片状态机 */
export type WallStatusEnum = 'IDLE' | 'LOADING' | 'LOADING_MORE' | 'READY' | 'DONE' | 'ERROR';

/** 海报墙分片缓存 */
export interface WallSlice {
  items: MediaLibraryItem[];
  total: number;
  startIndex: number;
  status: WallStatusEnum;
  errorCode?: AppErrorCode;
}

/** 库列表缓存键：`${serverId}:${userId}` */
export function librariesKeyOf(serverId: string, userId: string): string {
  return `${serverId}:${userId}`;
}

/** kinds 规范化：排序去重后 join(",")——同一组合无论传入顺序如何必命中同键 */
export function normalizeKinds(kinds?: ItemQuery['kinds']): string {
  return kinds && kinds.length > 0 ? Array.from(new Set(kinds)).sort().join(',') : '';
}

/** filters 规范化：排序后 join(",") */
export function normalizeFilters(filters?: ItemQuery['filters']): string {
  return filters && filters.length > 0 ? [...filters].sort().join(',') : '';
}

/** 字符串 id 列表规范化：排序去重后 join(",") */
export function normalizeIdList(idList?: string[]): string {
  return idList && idList.length > 0 ? Array.from(new Set(idList)).sort().join(',') : '';
}

/** 标签过滤规范化：按 id 排序去重，id=name 成对保留 */
export function normalizeTagFilters(tagFilters?: ItemQuery['tagFilters']): string {
  if (tagFilters === undefined || tagFilters.length === 0) {
    return '';
  }
  const unique = new Map(tagFilters.map((tag) => [tag.id, tag.name]));
  return Array.from(unique.keys())
    .sort()
    .map((id) => `${id}=${unique.get(id) ?? ''}`)
    .join(',');
}

/**
 * 海报墙缓存键（§4.8）：[serverId, userId, libraryId, tabId, normalizeKinds(kinds), sortBy,
 * sortOrder, normalizeFilters(filters), normalizeIdList(genreIds),
 * normalizeTagFilters(tagFilters), normalizeIdList(studioIds)].join("|")，字段顺序固定。
 * tabId 使同一库不同 Tab 的相同查询互不串缓存；新增过滤维度也必须入键。
 */
export function wallKeyOf(
  serverId: string,
  userId: string,
  libraryId: string,
  query: Pick<
    ItemQuery,
    'kinds' | 'sortBy' | 'sortOrder' | 'filters' | 'genreIds' | 'tagFilters' | 'studioIds'
  >,
  tabId = ''
): string {
  return [
    serverId,
    userId,
    libraryId,
    tabId,
    normalizeKinds(query.kinds),
    query.sortBy ?? 'SORT_NAME',
    query.sortOrder ?? '',
    normalizeFilters(query.filters),
    normalizeIdList(query.genreIds),
    normalizeTagFilters(query.tagFilters),
    normalizeIdList(query.studioIds),
  ].join('|');
}

interface BrowseActions {
  /** 拉取库列表并缓存（useFocusEffect 触发） */
  loadLibraries(key: string): Promise<void>;
  /**
   * 拉取海报墙一页：reset=筛选/排序/刷新（覆盖）；追加时按 id 去重（随机排序防重复，§7 风险 7）。
   */
  loadWallPage(key: string, query: ItemQuery, reset: boolean): Promise<void>;
  /**
   * 静默重拉已加载范围（库页聚焦刷新：详情页返回后已看/进度角标即时更新）。
   * 不进入 LOADING 态、保留滚动位置；仅 READY/DONE 态生效，失败静默保留旧数据。
   */
  refreshWall(key: string, query: ItemQuery): Promise<void>;
  /** 账号切换时清理（keyPrefix = `${serverId}:${userId}`） */
  resetAllForAccount(keyPrefix: string): void;
  /** 删除服务器级联清理（M4 §4.7）：清除该 serverId（含其下所有 userId）的浏览缓存 */
  resetAllForServer(serverId: string): void;
  /**
   * 海报墙收藏乐观更新（M4 §4.4）：收藏筛选下取消收藏仅本地翻转 userData.favorite
   * （卡片淡化置灰而非立即移除，避免服务端分页索引跳动），下拉刷新后自然收敛。
   * 返回翻转前的值供失败回滚。
   */
  patchItemFavorite(key: string, itemId: string, favorite: boolean): boolean | null;
  /**
   * 海报墙已看态就地更新（长按菜单标记已看/未看）：只改当前缓存条目，
   * 返回翻转前的值供失败回滚。
   */
  patchItemPlayed(key: string, itemId: string, played: boolean): boolean | null;
  /** 删除成功后摘除缓存条目（total 同步减一，支撑长按菜单删除） */
  removeWallItem(key: string, itemId: string): void;
}

interface BrowseState {
  librariesByKey: Record<string, MediaLibrary[]>;
  walls: Record<string, WallSlice>;
  actions: BrowseActions;
}

export const useBrowseStore = create<BrowseState>()((set, get) => ({
  librariesByKey: {},
  walls: {},

  actions: {
    loadLibraries: async (key: string) => {
      try {
        const libraries = await fetchLibraries();
        set((state) => ({ librariesByKey: { ...state.librariesByKey, [key]: libraries } }));
      } catch {
        // 失败置空数组：页面以空态呈现，下拉刷新可重试（错误码维度 M4 收口，M1 §2.1）
        set((state) => ({ librariesByKey: { ...state.librariesByKey, [key]: [] } }));
      }
    },

    loadWallPage: async (key: string, query: ItemQuery, reset: boolean) => {
      const existing = get().walls[key];
      // 同页在途防重（追加触发的重复 onEndReached）
      if (!reset && existing && (existing.status === 'LOADING' || existing.status === 'LOADING_MORE')) {
        return;
      }
      set((state) => ({
        walls: {
          ...state.walls,
          [key]: {
            items: reset ? [] : (existing?.items ?? []),
            total: reset ? 0 : (existing?.total ?? 0),
            startIndex: query.startIndex,
            status: reset ? 'LOADING' : 'LOADING_MORE',
          },
        },
      }));
      try {
        const page: Paged<MediaLibraryItem> = await fetchWallPage(query);
        set((state) => {
          const current = state.walls[key];
          if (!current) {
            return state;
          }
          const items = reset
            ? page.items
            : dedupeById([...current.items, ...page.items]);
          return {
            walls: {
              ...state.walls,
              [key]: {
                items,
                total: page.total,
                startIndex: query.startIndex,
                // items 已是「重置后的本页」或「累计合并后」的完整列表，长度即可加载总数
                status: items.length >= page.total ? 'DONE' : 'READY',
              },
            },
          };
        });
      } catch (err) {
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? ((err as { code?: AppErrorCode }).code ?? 'UNKNOWN')
            : 'UNKNOWN';
        set((state) => ({
          walls: {
            ...state.walls,
            [key]: {
              items: reset ? [] : (get().walls[key]?.items ?? []),
              total: reset ? 0 : (get().walls[key]?.total ?? 0),
              startIndex: query.startIndex,
              status: 'ERROR',
              errorCode,
            },
          },
        }));
      }
    },

    refreshWall: async (key: string, query: ItemQuery) => {
      const existing = get().walls[key];
      // 首屏加载/翻页在途时跳过，避免与 loadWallPage 互相覆盖
      if (existing === undefined || (existing.status !== 'READY' && existing.status !== 'DONE')) {
        return;
      }
      // 覆盖已加载范围（至少一页），刷新后可直接接续翻页
      const limit = Math.max(existing.items.length, query.limit);
      try {
        const page = await fetchWallPage({ ...query, startIndex: 0, limit });
        set((state) => {
          const current = state.walls[key];
          if (current === undefined) {
            return state;
          }
          return {
            walls: {
              ...state.walls,
              [key]: {
                ...current,
                items: page.items,
                total: page.total,
                startIndex: 0,
                status: page.items.length >= page.total ? 'DONE' : 'READY',
              },
            },
          };
        });
      } catch {
        // 静默失败：聚焦刷新不打扰页面，保留缓存
      }
    },

    resetAllForAccount: (keyPrefix: string) => {
      // 清理该账号的全部浏览缓存：keyPrefix = `${serverId}:${userId}`；
      // 库列表键以 `${serverId}:${userId}` 开头，海报墙键按 §4.8 以 `|` 连接
      // （`${serverId}|${userId}` 开头），两种前缀都参与匹配
      const wallPrefix = keyPrefix.replace(':', '|');
      set((state) => {
        const librariesByKey: Record<string, MediaLibrary[]> = {};
        Object.entries(state.librariesByKey).forEach(([key, value]) => {
          if (!key.startsWith(keyPrefix)) {
            librariesByKey[key] = value;
          }
        });
        const walls: Record<string, WallSlice> = {};
        Object.entries(state.walls).forEach(([key, value]) => {
          if (!key.startsWith(wallPrefix)) {
            walls[key] = value;
          }
        });
        return { librariesByKey, walls };
      });
    },

    resetAllForServer: (serverId: string) => {
      // 删除服务器级联（M4 §4.7）：该 serverId 下所有 userId 的缓存一并清除
      // （浏览数据本不持久化，仅内存态，无磁盘残留）
      set((state) => {
        const librariesByKey: Record<string, MediaLibrary[]> = {};
        Object.entries(state.librariesByKey).forEach(([key, value]) => {
          if (!key.startsWith(`${serverId}:`)) {
            librariesByKey[key] = value;
          }
        });
        const walls: Record<string, WallSlice> = {};
        Object.entries(state.walls).forEach(([key, value]) => {
          if (!key.startsWith(`${serverId}|`)) {
            walls[key] = value;
          }
        });
        return { librariesByKey, walls };
      });
    },

    patchItemFavorite: (key: string, itemId: string, favorite: boolean) => {
      const slice = get().walls[key];
      if (slice === undefined) {
        return null;
      }
      const previous = slice.items.find((item) => item.id === itemId)?.userData.favorite ?? null;
      set((state) => ({
        walls: {
          ...state.walls,
          [key]: {
            ...slice,
            items: slice.items.map((item) =>
              item.id === itemId
                ? { ...item, userData: { ...item.userData, favorite } }
                : item
            ),
          },
        },
      }));
      return previous;
    },

    patchItemPlayed: (key: string, itemId: string, played: boolean) => {
      const slice = get().walls[key];
      if (slice === undefined) {
        return null;
      }
      const previous = slice.items.find((item) => item.id === itemId)?.userData.played ?? null;
      set((state) => ({
        walls: {
          ...state.walls,
          [key]: {
            ...slice,
            items: slice.items.map((item) =>
              item.id === itemId
                ? { ...item, userData: { ...item.userData, played } }
                : item
            ),
          },
        },
      }));
      return previous;
    },

    removeWallItem: (key: string, itemId: string) => {
      const slice = get().walls[key];
      if (slice === undefined || !slice.items.some((item) => item.id === itemId)) {
        return;
      }
      set((state) => ({
        walls: {
          ...state.walls,
          [key]: {
            ...slice,
            items: slice.items.filter((item) => item.id !== itemId),
            total: Math.max(0, slice.total - 1),
          },
        },
      }));
    },
  },
}));

/** 按 id 去重（保持首次出现顺序；随机排序翻页防重复卡） */
function dedupeById(items: MediaLibraryItem[]): MediaLibraryItem[] {
  const seen = new Set<string>();
  const result: MediaLibraryItem[] = [];
  items.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  });
  return result;
}
