/**
 * 库页显示配置（persist）：按 flavor + 库类型保存已启用 Tab 的有序列表，
 * 按 flavor + 库类型 + Tab 保存已启用排序项的有序列表。
 * 只存覆盖；未覆盖时由 libraryConfig 回退目录默认值。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { LibraryTypeEnum, ServerFlavor, SortByEnum } from '@/adapter/model';
import { MAX_LIBRARY_TABS, tabsOfFlavor, type TabId } from '@/constant/libraryTabs';
import { SORT_CHAIN, SORT_SETS } from '@/constant/sortCatalog';
import { LIBRARY_DISPLAY_STORE_KEY } from '@/constant/storage';
import { createMmkvJSONStorage } from '@/infra/storage';
import { resolveTabSortOptions, tabScopeKeyOf, tabSortScopeKeyOf } from '@/util/libraryConfig';

interface LibraryDisplayActions {
  /** 启用时追加到末尾；5 上限 / 1 下限在 action 内夹紧 */
  toggleTab(flavor: ServerFlavor, libraryType: LibraryTypeEnum, tabId: TabId): void;
  /** 覆盖已启用 Tab 的顺序（只接受当前目录内且已启用的 id） */
  reorderTabs(flavor: ServerFlavor, libraryType: LibraryTypeEnum, orderedTabIds: TabId[]): void;
  resetTabs(flavor: ServerFlavor, libraryType: LibraryTypeEnum): void;
  /** 设置进入媒体库时默认打开的 Tab（仅接受已启用 Tab） */
  setDefaultTab(flavor: ServerFlavor, libraryType: LibraryTypeEnum, tabId: TabId): void;
  /** 启用时追加到末尾；至少保留 1 项 */
  toggleSort(
    flavor: ServerFlavor,
    libraryType: LibraryTypeEnum,
    tabId: TabId,
    sortBy: SortByEnum
  ): void;
  /** 覆盖某 Tab 已启用排序项的顺序 */
  reorderSorts(
    flavor: ServerFlavor,
    libraryType: LibraryTypeEnum,
    tabId: TabId,
    orderedSortIds: SortByEnum[]
  ): void;
  resetSorts(flavor: ServerFlavor, libraryType: LibraryTypeEnum, tabId: TabId): void;
  resetAll(flavor: ServerFlavor): void;
}

interface LibraryDisplayState {
  /** key = tabScopeKeyOf(flavor, libraryType) */
  tabListByScope: Record<string, TabId[]>;
  /** key = tabSortScopeKeyOf(flavor, libraryType, tabId) */
  sortListByTabScope: Record<string, SortByEnum[]>;
  /** key = tabScopeKeyOf(flavor, libraryType) → 进入媒体库时默认打开的 Tab */
  defaultTabByScope: Record<string, TabId>;
  actions: LibraryDisplayActions;
}

function defaultTabIdsOf(flavor: ServerFlavor, libraryType: LibraryTypeEnum): TabId[] {
  const catalog = tabsOfFlavor(libraryType, flavor);
  const defaultList = catalog
    .filter((tab) => tab.defaultEnabled)
    .slice(0, MAX_LIBRARY_TABS)
    .map((tab) => tab.id);
  return defaultList.length > 0 ? defaultList : catalog.slice(0, 1).map((tab) => tab.id);
}

function currentTabIdsOf(
  state: LibraryDisplayState,
  flavor: ServerFlavor,
  libraryType: LibraryTypeEnum
): TabId[] {
  const catalog = tabsOfFlavor(libraryType, flavor);
  const catalogIds = new Set(catalog.map((tab) => tab.id));
  const override = state.tabListByScope[tabScopeKeyOf(flavor, libraryType)];
  if (override === undefined) {
    return defaultTabIdsOf(flavor, libraryType);
  }
  const seen = new Set<TabId>();
  const result: TabId[] = [];
  for (const id of override) {
    if (seen.has(id) || !catalogIds.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_LIBRARY_TABS) {
      break;
    }
  }
  return result.length > 0 ? result : defaultTabIdsOf(flavor, libraryType);
}

function currentSortIdsOf(
  state: LibraryDisplayState,
  flavor: ServerFlavor,
  libraryType: LibraryTypeEnum,
  tabId: TabId
): SortByEnum[] {
  const tab = tabsOfFlavor(libraryType, flavor).find((item) => item.id === tabId);
  if (tab === undefined || tab.sortSet === 'none') {
    return [];
  }
  return resolveTabSortOptions({
    flavor,
    libraryType,
    tab,
    sortOverrides: state.sortListByTabScope,
  }).map((option) => option.value);
}

export const useLibraryDisplayStore = create<LibraryDisplayState>()(
  persist(
    (set) => ({
      tabListByScope: {},
      sortListByTabScope: {},
      defaultTabByScope: {},

      actions: {
        toggleTab: (flavor, libraryType, tabId) => {
          set((state) => {
            const catalog = tabsOfFlavor(libraryType, flavor);
            if (!catalog.some((tab) => tab.id === tabId)) {
              return state;
            }
            const current = currentTabIdsOf(state, flavor, libraryType);
            const active = current.includes(tabId);
            let next: TabId[];
            if (active) {
              if (current.length <= 1) {
                return state;
              }
              next = current.filter((id) => id !== tabId);
            } else {
              if (current.length >= MAX_LIBRARY_TABS) {
                return state;
              }
              next = [...current, tabId];
            }
            const scopeKey = tabScopeKeyOf(flavor, libraryType);
            const tabListByScope = { ...state.tabListByScope, [scopeKey]: next };
            // 关闭默认 Tab 时清除默认设置，回退到目录默认选中
            if (active && state.defaultTabByScope[scopeKey] === tabId) {
              const defaultTabByScope = { ...state.defaultTabByScope };
              delete defaultTabByScope[scopeKey];
              return { tabListByScope, defaultTabByScope };
            }
            return { tabListByScope };
          });
        },

        reorderTabs: (flavor, libraryType, orderedTabIds) => {
          set((state) => {
            const current = currentTabIdsOf(state, flavor, libraryType);
            const currentSet = new Set(current);
            const seen = new Set<TabId>();
            const next: TabId[] = [];
            for (const id of orderedTabIds) {
              if (!currentSet.has(id) || seen.has(id)) {
                continue;
              }
              seen.add(id);
              next.push(id);
              if (next.length >= MAX_LIBRARY_TABS) {
                break;
              }
            }
            if (next.length === 0 || next.length !== current.length) {
              return state;
            }
            return {
              tabListByScope: {
                ...state.tabListByScope,
                [tabScopeKeyOf(flavor, libraryType)]: next,
              },
            };
          });
        },

        resetTabs: (flavor, libraryType) => {
          set((state) => {
            const key = tabScopeKeyOf(flavor, libraryType);
            if (
              state.tabListByScope[key] === undefined &&
              state.defaultTabByScope[key] === undefined
            ) {
              return state;
            }
            const tabListByScope = { ...state.tabListByScope };
            delete tabListByScope[key];
            const defaultTabByScope = { ...state.defaultTabByScope };
            delete defaultTabByScope[key];
            return { tabListByScope, defaultTabByScope };
          });
        },

        setDefaultTab: (flavor, libraryType, tabId) => {
          set((state) => {
            const catalog = tabsOfFlavor(libraryType, flavor);
            if (!catalog.some((tab) => tab.id === tabId)) {
              return state;
            }
            if (!currentTabIdsOf(state, flavor, libraryType).includes(tabId)) {
              return state;
            }
            return {
              defaultTabByScope: {
                ...state.defaultTabByScope,
                [tabScopeKeyOf(flavor, libraryType)]: tabId,
              },
            };
          });
        },

        toggleSort: (flavor, libraryType, tabId, sortBy) => {
          set((state) => {
            const tab = tabsOfFlavor(libraryType, flavor).find((item) => item.id === tabId);
            if (tab === undefined || tab.sortSet === 'none') {
              return state;
            }
            if (!SORT_SETS[tab.sortSet].available.includes(sortBy) || SORT_CHAIN[flavor][sortBy] === null) {
              return state;
            }
            const current = currentSortIdsOf(state, flavor, libraryType, tabId);
            const active = current.includes(sortBy);
            let next: SortByEnum[];
            if (active) {
              if (current.length <= 1) {
                return state;
              }
              next = current.filter((value) => value !== sortBy);
            } else {
              next = [...current, sortBy];
            }
            return {
              sortListByTabScope: {
                ...state.sortListByTabScope,
                [tabSortScopeKeyOf(flavor, libraryType, tabId)]: next,
              },
            };
          });
        },

        reorderSorts: (flavor, libraryType, tabId, orderedSortIds) => {
          set((state) => {
            const current = currentSortIdsOf(state, flavor, libraryType, tabId);
            const currentSet = new Set(current);
            const seen = new Set<SortByEnum>();
            const next: SortByEnum[] = [];
            for (const value of orderedSortIds) {
              if (!currentSet.has(value) || seen.has(value)) {
                continue;
              }
              seen.add(value);
              next.push(value);
            }
            if (next.length === 0 || next.length !== current.length) {
              return state;
            }
            return {
              sortListByTabScope: {
                ...state.sortListByTabScope,
                [tabSortScopeKeyOf(flavor, libraryType, tabId)]: next,
              },
            };
          });
        },

        resetSorts: (flavor, libraryType, tabId) => {
          set((state) => {
            const key = tabSortScopeKeyOf(flavor, libraryType, tabId);
            if (state.sortListByTabScope[key] === undefined) {
              return state;
            }
            const sortListByTabScope = { ...state.sortListByTabScope };
            delete sortListByTabScope[key];
            return { sortListByTabScope };
          });
        },

        resetAll: (flavor) => {
          set((state) => {
            const prefix = `${flavor}:`;
            const tabListByScope = Object.fromEntries(
              Object.entries(state.tabListByScope).filter(([key]) => !key.startsWith(prefix))
            );
            const sortListByTabScope = Object.fromEntries(
              Object.entries(state.sortListByTabScope).filter(([key]) => !key.startsWith(prefix))
            );
            const defaultTabByScope = Object.fromEntries(
              Object.entries(state.defaultTabByScope).filter(([key]) => !key.startsWith(prefix))
            );
            return { tabListByScope, sortListByTabScope, defaultTabByScope };
          });
        },
      },
    }),
    {
      name: LIBRARY_DISPLAY_STORE_KEY,
      storage: createMmkvJSONStorage(),
      partialize: (state) => ({
        tabListByScope: state.tabListByScope,
        sortListByTabScope: state.sortListByTabScope,
        defaultTabByScope: state.defaultTabByScope,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        actions: currentState.actions,
      }),
    }
  )
);
