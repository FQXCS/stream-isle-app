/**
 * 库页 Tab/排序解析（纯函数）：catalog + 用户覆盖 → 有效 Tab 列表 / SortMenu 选项。
 * 规则：override 数组顺序即显示顺序；未知 id 丢弃；空回退默认；Tab 截断到 5 个。
 */
import type { LibraryTypeEnum, ServerFlavor, SortByEnum } from '@/adapter/model';
import type { SortOption } from '@/constant/browse';
import {
  MAX_LIBRARY_TABS,
  tabsOfFlavor,
  type TabId,
  type TabSpec,
} from '@/constant/libraryTabs';
import { SORT_CHAIN, SORT_SETS, sortOptionListOf } from '@/constant/sortCatalog';

export function tabScopeKeyOf(flavor: ServerFlavor, libraryType: LibraryTypeEnum): string {
  return `${flavor}:${libraryType}`;
}

export function tabSortScopeKeyOf(
  flavor: ServerFlavor,
  libraryType: LibraryTypeEnum,
  tabId: TabId
): string {
  return `${flavor}:${libraryType}:${tabId}`;
}

export interface ResolveTabListInput {
  flavor: ServerFlavor;
  libraryType: LibraryTypeEnum;
  /** key = tabScopeKeyOf(flavor, libraryType)；值为已启用 Tab 的有序列表 */
  tabOverrides?: Record<string, TabId[]>;
}

/** 解析库页有效 Tab：用户顺序优先；无覆盖取 defaultEnabled；至少 1 个 */
export function resolveTabList(input: ResolveTabListInput): readonly TabSpec[] {
  const catalog = tabsOfFlavor(input.libraryType, input.flavor);
  const catalogMap = new Map(catalog.map((tab) => [tab.id, tab]));
  const override = input.tabOverrides?.[tabScopeKeyOf(input.flavor, input.libraryType)];

  if (override !== undefined) {
    const seen = new Set<TabId>();
    const tabList: TabSpec[] = [];
    for (const id of override) {
      if (seen.has(id)) {
        continue;
      }
      const tab = catalogMap.get(id);
      if (tab === undefined) {
        continue;
      }
      seen.add(id);
      tabList.push(tab);
      if (tabList.length >= MAX_LIBRARY_TABS) {
        break;
      }
    }
    if (tabList.length > 0) {
      return tabList;
    }
  }

  const defaultList = catalog
    .filter((tab) => tab.defaultEnabled)
    .slice(0, MAX_LIBRARY_TABS);
  if (defaultList.length > 0) {
    return defaultList;
  }
  return catalog.slice(0, 1);
}

/** 默认选中的 Tab：用户默认显示配置优先（需仍启用），否则 defaultSelected，最后首个 */
export function resolveDefaultTabId(
  tabList: readonly TabSpec[],
  preferredTabId?: TabId
): TabId | undefined {
  if (preferredTabId !== undefined && tabList.some((tab) => tab.id === preferredTabId)) {
    return preferredTabId;
  }
  return tabList.find((tab) => tab.defaultSelected)?.id ?? tabList[0]?.id;
}

/** 库的主内容 Tab（文件夹/收藏/已看/未看排序跟随它）：优先默认选中 Tab，否则首个可排序 Tab */
export function primarySortTabOf(
  flavor: ServerFlavor,
  libraryType: LibraryTypeEnum
): TabSpec | undefined {
  const tabList = tabsOfFlavor(libraryType, flavor);
  const defaultTab = tabList.find((tab) => tab.defaultSelected);
  if (defaultTab !== undefined && defaultTab.sortSet !== 'none') {
    return defaultTab;
  }
  return tabList.find((tab) => tab.sortSet !== 'none');
}

/** 筛选视图（收藏/已看/未看）与文件夹一样跟随本库主内容 Tab 排序 */
const PRIMARY_SORT_VIEW_IDS: ReadonlySet<TabId> = new Set(['favorite', 'played', 'unplayed']);

export function usesPrimarySortConfig(tab: TabSpec): boolean {
  return tab.source === 'folder' || PRIMARY_SORT_VIEW_IDS.has(tab.id);
}

export interface ResolvePrimarySortOptionsInput {
  flavor: ServerFlavor;
  libraryType: LibraryTypeEnum;
  sortOverrides?: Record<string, SortByEnum[]>;
}

/**
 * 内容视图的排序选项：文件夹（含多级）与收藏/已看/未看统一复用本库主内容 Tab
 * 的排序配置，不再使用各自的 Tab 配置；选中排序仍按当前视图独立记忆。
 */
export function resolvePrimarySortOptions(
  input: ResolvePrimarySortOptionsInput
): readonly SortOption[] {
  const tab = primarySortTabOf(input.flavor, input.libraryType);
  if (tab === undefined) {
    return [];
  }
  return resolveTabSortOptions({
    flavor: input.flavor,
    libraryType: input.libraryType,
    tab,
    sortOverrides: input.sortOverrides,
  });
}

export interface ResolveTabSortOptionsInput {
  flavor: ServerFlavor;
  libraryType: LibraryTypeEnum;
  tab: TabSpec;
  /** key = tabSortScopeKeyOf(flavor, libraryType, tabId)；值为已启用排序项的有序列表 */
  sortOverrides?: Record<string, SortByEnum[]>;
}

/** 解析某 Tab 的 SortMenu 选项：用户顺序优先；无覆盖取 defaultChecked；至少 1 项 */
export function resolveTabSortOptions(input: ResolveTabSortOptionsInput): readonly SortOption[] {
  const { flavor, libraryType, tab, sortOverrides } = input;
  if (tab.sortSet === 'none') {
    return [];
  }

  const sortSet = SORT_SETS[tab.sortSet];
  const chainBySort = SORT_CHAIN[flavor];
  const availableSet = new Set(sortSet.available);
  const supported = (value: SortByEnum): boolean =>
    availableSet.has(value) && chainBySort[value] !== null;

  const filterSupported = (valueList: readonly SortByEnum[]): SortByEnum[] => {
    const seen = new Set<SortByEnum>();
    const result: SortByEnum[] = [];
    for (const value of valueList) {
      if (seen.has(value) || !supported(value)) {
        continue;
      }
      seen.add(value);
      result.push(value);
    }
    return result;
  };

  const override = sortOverrides?.[tabSortScopeKeyOf(flavor, libraryType, tab.id)];
  if (override !== undefined) {
    const overrideList = filterSupported(override);
    if (overrideList.length > 0) {
      return sortOptionListOf(overrideList);
    }
  }

  const defaultList = filterSupported(sortSet.defaultChecked);
  if (defaultList.length > 0) {
    return sortOptionListOf(defaultList);
  }

  const firstAvailable = sortSet.available.find(supported);
  return firstAvailable === undefined ? [] : sortOptionListOf([firstAvailable]);
}
