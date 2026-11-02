/**
 * 库页视图偏好（持久化，MMKV）：按「服务器 id + 库 id」记住上次的排序字段与方向，
 * 下次进入同一库页默认沿用（用户要求：每个库的排序都要记住）。
 * 仅浏览偏好，不含 token 等敏感数据；账号删除不级联清理（键含 serverId，重登后仍可用）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SortByEnum } from '@/adapter/model';
import { SORT_OPTIONS } from '@/constant/browse';
import { LIBRARY_VIEW_STORE_KEY } from '@/constant/storage';
import { createMmkvJSONStorage } from '@/infra/storage';

/** 单个库的排序状态 */
export interface LibrarySortState {
  sortBy: SortByEnum;
  sortOrder: 'ASC' | 'DESC';
}

/** 默认排序（SORT_OPTIONS 首项「标题」升序） */
export const DEFAULT_LIBRARY_SORT: LibrarySortState = {
  sortBy: SORT_OPTIONS[0].value,
  sortOrder: SORT_OPTIONS[0].defaultOrder ?? 'ASC',
};

/** 排序持久化键：服务器 + 库（库 id 在不同服务器可能重复，故带 serverId） */
export function librarySortKeyOf(serverId: string, libraryId: string): string {
  return `${serverId}:${libraryId}`;
}

/** Tab 级排序持久化键：服务器 + 库 + Tab（旧键仍作为缺省回退） */
export function libraryTabSortKeyOf(
  serverId: string,
  libraryId: string,
  tabId: string
): string {
  return `${serverId}:${libraryId}:${tabId}`;
}

/**
 * 读取某库某 Tab 的排序：优先 Tab 级新键，缺失回退旧的库级键
 * （升级后用户上次排序不丢；写入一律新键）。
 */
export function savedLibrarySortOf(
  sortByKey: Record<string, LibrarySortState>,
  serverId: string,
  libraryId: string,
  tabId: string
): LibrarySortState | undefined {
  return (
    sortByKey[libraryTabSortKeyOf(serverId, libraryId, tabId)] ??
    sortByKey[librarySortKeyOf(serverId, libraryId)]
  );
}

interface LibraryViewActions {
  /** 写入某库的排序（页面切换排序时调用，随 persist 落盘） */
  setLibrarySort(key: string, sort: LibrarySortState): void;
}

interface LibraryViewState {
  /** 键 = librarySortKeyOf(serverId, libraryId) */
  sortByKey: Record<string, LibrarySortState>;
  actions: LibraryViewActions;
}

export const useLibraryViewStore = create<LibraryViewState>()(
  persist(
    (set) => ({
      sortByKey: {},
      actions: {
        setLibrarySort: (key: string, sort: LibrarySortState) =>
          set((state) => ({ sortByKey: { ...state.sortByKey, [key]: sort } })),
      },
    }),
    {
      name: LIBRARY_VIEW_STORE_KEY,
      storage: createMmkvJSONStorage(),
      // 只持久化数据字段（actions 为函数，不进快照）
      partialize: (state) => ({ sortByKey: state.sortByKey }),
    }
  )
);
