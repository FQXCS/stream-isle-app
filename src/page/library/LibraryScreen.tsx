/**
 * 库内容页（M8 目录驱动）：按活跃服务器 flavor + 用户配置解析有效 Tab 列表，
 * SegmentedControl 按用户顺序渲染；每 Tab 独立排序记忆（libraryViewStore Tab 键），
 * 排序项按 Tab 配置顺序渲染（文件夹/收藏/已看/未看例外：跟随本库主内容 Tab 的排序配置）。
 * MUSIC/PHOTO/新库类型统一走 TabContent 渲染器。
 */
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import type { MediaLibrary, SortByEnum } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { SegmentedControl } from '@/component/SegmentedControl';
import { SortMenu, SortMenuButton } from '@/component/SortMenu';
import { useTheme } from '@/component/useTheme';
import type { TabSpec } from '@/constant/libraryTabs';
import { type ThemeTokens } from '@/constant/theme';
import { TabContent } from '@/page/library/tabs/TabContent';
import type { RootStackParamList } from '@/page/navigation/types';
import { useAccountStore, useActiveServerFlavor } from '@/store/accountStore';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import {
  libraryTabSortKeyOf,
  savedLibrarySortOf,
  useLibraryViewStore,
  type LibrarySortState,
} from '@/store/libraryViewStore';
import {
  resolveDefaultTabId,
  resolvePrimarySortOptions,
  resolveTabList,
  resolveTabSortOptions,
  tabScopeKeyOf,
  usesPrimarySortConfig,
} from '@/util/libraryConfig';

type LibraryNavigation = NativeStackNavigationProp<RootStackParamList>;

export function LibraryScreen() {
  const route = useRoute<{ key: string; name: string; params: { library: MediaLibrary } }>();
  const library = route.params.library;
  const active = useAccountStore((state) => state.active);
  // 账号切换时整体重挂载，保证 Tab/排序状态干净
  const accountKey = active ? `${active.serverId}:${active.userId}` : '';
  return <LibraryBody key={accountKey} library={library} />;
}

function LibraryBody({ library }: { library: MediaLibrary }) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<LibraryNavigation>();
  const flavor = useActiveServerFlavor();
  const active = useAccountStore((state) => state.active);
  const serverId = active?.serverId ?? '';
  const tabListByScope = useLibraryDisplayStore((state) => state.tabListByScope);
  const sortListByTabScope = useLibraryDisplayStore((state) => state.sortListByTabScope);
  const defaultTabByScope = useLibraryDisplayStore((state) => state.defaultTabByScope);
  const sortByKey = useLibraryViewStore((state) => state.sortByKey);

  const tabList = useMemo(
    () =>
      resolveTabList({
        flavor,
        libraryType: library.type,
        tabOverrides: tabListByScope,
      }),
    [flavor, library.type, tabListByScope]
  );
  const defaultTabId = resolveDefaultTabId(
    tabList,
    defaultTabByScope[tabScopeKeyOf(flavor, library.type)]
  );
  const [selectedTabId, setSelectedTabId] = useState<string | undefined>(defaultTabId);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const activeTab: TabSpec | undefined =
    tabList.find((tab) => tab.id === selectedTabId) ?? tabList[0];
  const tabBarOptions = useMemo(
    () => tabList.map((tab) => ({ value: tab.id, label: tab.label })),
    [tabList]
  );

  const sortOptions = useMemo(
    () =>
      activeTab === undefined
        ? []
        : usesPrimarySortConfig(activeTab)
          ? resolvePrimarySortOptions({
              flavor,
              libraryType: library.type,
              sortOverrides: sortListByTabScope,
            })
          : resolveTabSortOptions({
              flavor,
              libraryType: library.type,
              tab: activeTab,
              sortOverrides: sortListByTabScope,
            }),
    [flavor, library.type, activeTab, sortListByTabScope]
  );
  const savedSort =
    activeTab === undefined
      ? undefined
      : savedLibrarySortOf(sortByKey, serverId, library.id, activeTab.id);
  const sortSupported =
    savedSort !== undefined && sortOptions.some((option) => option.value === savedSort.sortBy);
  const activeSortBy: SortByEnum =
    sortSupported && savedSort !== undefined
      ? savedSort.sortBy
      : (sortOptions[0]?.value ?? 'SORT_NAME');
  const activeSortOrder: 'ASC' | 'DESC' =
    sortSupported && savedSort !== undefined
      ? savedSort.sortOrder
      : (sortOptions[0]?.defaultOrder ?? 'ASC');
  const sort: LibrarySortState = { sortBy: activeSortBy, sortOrder: activeSortOrder };

  const handleSelectTab = useCallback((tabId: string) => {
    setSelectedTabId(tabId);
    setSortMenuOpen(false);
  }, []);

  const handleClearFilter = useCallback(() => {
    const allTab = tabList.find((tab) => tab.id === 'all');
    const fallback = allTab ?? tabList[0];
    if (fallback !== undefined) {
      setSelectedTabId(fallback.id);
    }
  }, [tabList]);

  const handleToggleSortMenu = useCallback(() => setSortMenuOpen((open) => !open), []);
  const handleCloseSortMenu = useCallback(() => setSortMenuOpen(false), []);

  const handleSelectSort = useCallback(
    (next: SortByEnum) => {
      if (activeTab === undefined) {
        return;
      }
      const option = sortOptions.find((item) => item.value === next);
      let nextOrder: 'ASC' | 'DESC';
      if (next === activeSortBy) {
        if (option?.defaultOrder === null) {
          return;
        }
        nextOrder = activeSortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        nextOrder = option?.defaultOrder ?? 'ASC';
      }
      setSortMenuOpen(false);
      useLibraryViewStore.getState().actions.setLibrarySort(
        libraryTabSortKeyOf(serverId, library.id, activeTab.id),
        { sortBy: next, sortOrder: nextOrder }
      );
    },
    [activeSortBy, activeSortOrder, activeTab, library.id, serverId, sortOptions]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        sortOptions.length > 0
          ? () => <SortMenuButton onPress={handleToggleSortMenu} />
          : undefined,
    });
  }, [navigation, sortOptions.length, handleToggleSortMenu]);

  if (tabList.length === 0 || activeTab === undefined) {
    return <EmptyView title="库内暂无分类" />;
  }

  return (
    <View style={styles.fill}>
      {tabList.length > 1 && (
        <SegmentedControl
          optionList={tabBarOptions}
          value={activeTab.id}
          onChange={handleSelectTab}
        />
      )}
      <TabContent
        key={activeTab.id}
        tab={activeTab}
        library={library}
        sort={sort}
        onClearFilter={handleClearFilter}
      />
      {sortMenuOpen && sortOptions.length > 0 && (
        <SortMenu
          sortBy={activeSortBy}
          sortOrder={activeSortOrder}
          optionList={sortOptions}
          onSelect={handleSelectSort}
          onClose={handleCloseSortMenu}
        />
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bg },
  });
