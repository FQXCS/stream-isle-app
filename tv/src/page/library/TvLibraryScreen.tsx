/**
 * TV 库浏览页（TV-m2 §4.1）：由首页「我的媒体」/库卡片 Enter 进入（stack push，无侧栏）。
 * 数据链路与手机 LibraryScreen 同构：resolveTabList 按 flavor + 用户覆盖解析有效 Tab；
 * 渲染层走 TV 白名单（TV-m2-S1：仅 poster wall / folder 类，songs/album/photo/liveTv/
 * special 过滤不渲染），白名单交集为空渲染「该库类型 TV 暂不支持」空态（不崩，风险 #2）。
 * 排序只读消费 libraryViewStore 记忆（验收 #9；排序编辑菜单不在 m2，顺延）。
 * Tab 栏 + 标题经 listHeader 渲染进网格 FlatList（同 ScrollView 子树，焦点互达，验收 #3/#4）。
 */
import { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import type { ItemQuery, MediaLibrary } from '@/adapter/model';
import { PAGE_SIZE } from '@/constant/browse';
import type { TabSpec } from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import { useT, type TFunction } from '@/i18n';
import { useAccountStore, useActiveServerFlavor } from '@/store/accountStore';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { wallKeyOf } from '@/store/browseStore';
import { savedLibrarySortOf, useLibraryViewStore } from '@/store/libraryViewStore';
import {
  resolveDefaultTabId,
  resolvePrimarySortOptions,
  resolveTabList,
  resolveTabSortOptions,
  tabScopeKeyOf,
  usesPrimarySortConfig,
} from '@/util/libraryConfig';

import { TvEmptyView } from '@tv/component/TvStateViews';
import { TvTabBar } from '@tv/component/TvTabBar';
import { TvWallGrid } from '@tv/component/TvWallGrid';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { useTvTheme } from '@tv/component/useTvTheme';
import { tvNavigateTabItem } from '@tv/page/library/navigation';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

/**
 * TV 渲染器白名单（TV-m2-S1）：仅海报墙（items 源、tap 落详情/合集列表）与
 * 文件夹类 Tab；suggestions/genres 等 special、songs/album/photo/liveTv 渲染器过滤。
 * 白名单内 Tap 仅 item/collection（album/artist/playlist 类 tap 落手机专属路由，不渲染）。
 */
function isTvWhitelistedTab(tab: TabSpec): boolean {
  if (tab.renderer === 'folderBrowser') {
    return true;
  }
  return (
    tab.renderer === 'posterWall' &&
    tab.source === 'items' &&
    (tab.tap === 'item' || tab.tap === 'collection')
  );
}

/** 空态文案（手机 PosterWallTab emptyTitleOf 同口径） */
function emptyTitleOf(tab: TabSpec, tr: TFunction): string {
  if (tab.filters?.includes('IsFavorite')) {
    return tr('library.emptyFavorites');
  }
  if (tab.filters?.includes('IsUnplayed')) {
    return tr('library.emptyUnplayed');
  }
  if (tab.filters?.includes('IsPlayed')) {
    return tr('library.emptyPlayed');
  }
  return tr('library.emptyItems');
}

export function TvLibraryScreen() {
  const route = useRoute<{ key: string; name: string; params: { library: MediaLibrary } }>();
  const library = route.params.library;
  const navigation = useNavigation<TvNavigation>();
  const t = useTvTheme();
  const tr = useT();
  const flavor = useActiveServerFlavor();
  const active = useAccountStore((state) => state.active);
  const serverId = active?.serverId ?? '';
  const userId = active?.userId ?? '';
  const tabListByScope = useLibraryDisplayStore((state) => state.tabListByScope);
  const defaultTabByScope = useLibraryDisplayStore((state) => state.defaultTabByScope);
  const sortByKey = useLibraryViewStore((state) => state.sortByKey);

  // 有效 Tab → TV 白名单交集（TV-m2-S1）
  const tabList = useMemo(
    () =>
      resolveTabList({
        flavor,
        libraryType: library.type,
        tabOverrides: tabListByScope,
      }).filter(isTvWhitelistedTab),
    [flavor, library.type, tabListByScope]
  );
  const defaultTabId = resolveDefaultTabId(
    tabList,
    defaultTabByScope[tabScopeKeyOf(flavor, library.type)]
  );
  const [selectedTabId, setSelectedTabId] = useState<string | undefined>(defaultTabId);
  const activeTab: TabSpec | undefined =
    tabList.find((tab) => tab.id === selectedTabId) ?? tabList[0];

  // 排序只读消费（验收 #9）：选项解析与手机同口径（文件夹/收藏/已看/未看跟随主内容 Tab 配置）
  const sortOptions = useMemo(
    () =>
      activeTab === undefined
        ? []
        : usesPrimarySortConfig(activeTab)
          ? resolvePrimarySortOptions({ flavor, libraryType: library.type })
          : resolveTabSortOptions({ flavor, libraryType: library.type, tab: activeTab }),
    [flavor, library.type, activeTab]
  );
  const savedSort =
    activeTab === undefined
      ? undefined
      : savedLibrarySortOf(sortByKey, serverId, library.id, activeTab.id);
  const sortSupported =
    savedSort !== undefined && sortOptions.some((option) => option.value === savedSort.sortBy);
  const sortBy = sortSupported && savedSort !== undefined
    ? savedSort.sortBy
    : (sortOptions[0]?.value ?? 'SORT_NAME');
  const sortOrder: 'ASC' | 'DESC' = sortSupported && savedSort !== undefined
    ? savedSort.sortOrder
    : (sortOptions[0]?.defaultOrder ?? 'ASC');

  const query = useMemo<ItemQuery>(
    () => ({
      userId,
      parentId: library.id,
      kinds: activeTab?.kinds !== undefined ? [...activeTab.kinds] : undefined,
      filters: activeTab?.filters !== undefined ? [...activeTab.filters] : undefined,
      // 文件夹 Tab 显式非递归（adapter 对 undefined 默认递归，手机 FolderTab 同口径）
      recursive: activeTab?.source === 'folder' ? false : activeTab?.recursive,
      sortBy,
      sortOrder,
      startIndex: 0,
      limit: PAGE_SIZE,
    }),
    [userId, library.id, activeTab, sortBy, sortOrder]
  );
  const wallKey = useMemo(
    () => wallKeyOf(serverId, userId, library.id, query, activeTab?.id ?? ''),
    [serverId, userId, library.id, query, activeTab]
  );

  // 白名单交集为空（音乐/照片/直播类库）：渲染空态不崩（风险 #2）
  if (tabList.length === 0 || activeTab === undefined) {
    return (
      <TvScreenFrame>
        <TvEmptyView title={tr('tv.unsupportedLibrary')} />
      </TvScreenFrame>
    );
  }

  // Header（标题 + Tab 栏）元素形式传入网格 FlatList（同 ScrollView 子树，TV-m1-S7）
  const listHeader = (
    <View style={styles.header}>
      <Text style={[styles.title, { color: t.textPrimary }]} numberOfLines={1}>
        {library.name}
      </Text>
      {tabList.length > 1 && (
        <TvTabBar
          tabs={tabList.map((tab) => ({ id: tab.id, label: tr(tab.labelKey) }))}
          selectedId={activeTab.id}
          onSelect={setSelectedTabId}
        />
      )}
    </View>
  );

  const favoriteViewActive = activeTab.filters?.includes('IsFavorite') ?? false;

  return (
    <TvScreenFrame>
      <TvWallGrid
        wallKey={wallKey}
        query={query}
        listHeader={listHeader}
        emptyTitle={emptyTitleOf(activeTab, tr)}
        onPressItem={(item) => tvNavigateTabItem(navigation, activeTab.tap, item)}
        onPressFolder={(item) =>
          navigation.navigate(ROUTES.LIBRARY_FOLDER, {
            libraryId: library.id,
            libraryType: library.type,
            folderId: item.id,
            folderName: item.name,
            tabId: activeTab.id,
            sortBy,
            sortOrder,
            kind: 'folder',
          })
        }
        dimUnfavorite={favoriteViewActive}
      />
    </TvScreenFrame>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingTop: 8, paddingBottom: 16, alignItems: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 16 },
});
