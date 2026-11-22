/**
 * 库内文件夹/相册下钻页：由文件夹 Tab 或上一层文件夹 push 进入，
 * 顶部标题为目录名，内容按库类型复用 LibraryFolderBrowser（不含库页 Tab 栏）；
 * 右上角保留排序入口，排序选项跟随本库主内容 Tab 的配置，排序记忆与文件夹 Tab 键共享。
 */
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import type { SortByEnum } from '@/adapter/model';
import { SortMenu, SortMenuButton } from '@/component/SortMenu';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { LibraryFolderBrowser } from '@/page/library/components/LibraryFolderBrowser';
import type { RootStackParamList } from '@/page/navigation/types';
import { useAccountStore, useActiveServerFlavor } from '@/store/accountStore';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import {
  libraryTabSortKeyOf,
  savedLibrarySortOf,
  useLibraryViewStore,
  type LibrarySortState,
} from '@/store/libraryViewStore';
import { resolvePrimarySortOptions } from '@/util/libraryConfig';

type FolderNavigation = NativeStackNavigationProp<RootStackParamList>;

export function LibraryFolderScreen() {
  const route = useRoute<RouteProp<RootStackParamList, typeof ROUTES.LIBRARY_FOLDER>>();
  const { libraryId, libraryType, folderId, tabId, kind, sortBy, sortOrder } = route.params;
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<FolderNavigation>();
  const flavor = useActiveServerFlavor();
  const serverId = useAccountStore((state) => state.active?.serverId ?? '');
  const sortOverrides = useLibraryDisplayStore((state) => state.sortListByTabScope);
  const sortByKey = useLibraryViewStore((state) => state.sortByKey);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // 文件夹页无 Tab 栏，排序选项跟随本库主内容 Tab 的配置
  const sortOptions = useMemo(
    () => resolvePrimarySortOptions({ flavor, libraryType, sortOverrides }),
    [flavor, libraryType, sortOverrides]
  );
  const savedSort = savedLibrarySortOf(sortByKey, serverId, libraryId, tabId);
  const sortSupported =
    savedSort !== undefined && sortOptions.some((option) => option.value === savedSort.sortBy);
  const activeSortBy: SortByEnum =
    sortSupported && savedSort !== undefined
      ? savedSort.sortBy
      : (sortOptions[0]?.value ?? sortBy);
  const activeSortOrder: 'ASC' | 'DESC' =
    sortSupported && savedSort !== undefined
      ? savedSort.sortOrder
      : (sortOptions[0]?.defaultOrder ?? sortOrder);
  const sort: LibrarySortState = { sortBy: activeSortBy, sortOrder: activeSortOrder };

  const handleToggleSortMenu = useCallback(() => setSortMenuOpen((open) => !open), []);
  const handleCloseSortMenu = useCallback(() => setSortMenuOpen(false), []);

  const handleSelectSort = useCallback(
    (next: SortByEnum) => {
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
        libraryTabSortKeyOf(serverId, libraryId, tabId),
        { sortBy: next, sortOrder: nextOrder }
      );
    },
    [activeSortBy, activeSortOrder, libraryId, serverId, sortOptions, tabId]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        sortOptions.length > 0
          ? () => <SortMenuButton onPress={handleToggleSortMenu} />
          : undefined,
    });
  }, [navigation, sortOptions.length, handleToggleSortMenu]);

  return (
    <View style={styles.fill}>
      <View style={styles.content}>
        <LibraryFolderBrowser
          libraryId={libraryId}
          libraryType={libraryType}
          containerId={folderId}
          sort={sort}
          tabId={tabId}
          album={kind === 'album'}
        />
      </View>
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
    // 无 Tab 栏时在导航栏与内容之间留出呼吸间距
    content: { flex: 1, paddingTop: SPACING.m },
  });
