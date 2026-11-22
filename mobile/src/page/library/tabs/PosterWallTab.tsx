/**
 * 通用海报墙 Tab：由 TabSpec 的 kinds/filters 组装 ItemQuery，走 browseStore 分页缓存；
 * 收藏 Tab 支持取消收藏淡化，长按弹出操作菜单。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import type { ItemQuery, MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { LoadingView } from '@/component/LoadingView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS, PAGE_END_THRESHOLD, PAGE_SIZE } from '@/constant/browse';
import type { TabSpec } from '@/constant/libraryTabs';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useT, type TFunction } from '@/i18n';
import { AppError, errorMessageOf } from '@/infra/error';
import { navigateTabItem } from '@/page/library/tabs/navigation';
import { WallGridCell } from '@/page/library/components/WallGridCell';
import { FolderCard } from '@/page/library/components/FolderCard';
import type { RootStackParamList } from '@/page/navigation/types';
import { markService } from '@/service/MarkService';
import { useAccountStore } from '@/store/accountStore';
import { useBrowseStore, wallKeyOf } from '@/store/browseStore';
import type { LibrarySortState } from '@/store/libraryViewStore';

type WallNavigation = NativeStackNavigationProp<RootStackParamList>;

interface PosterWallTabProps {
  tab: TabSpec;
  libraryId: string;
  sort: LibrarySortState;
  onClearFilter?: () => void;
}

function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

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

export function PosterWallTab({ tab, libraryId, sort, onClearFilter }: PosterWallTabProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<WallNavigation>();
  const active = useAccountStore((state) => state.active);
  const serverId = active?.serverId ?? '';
  const userId = active?.userId ?? '';
  const miniPlayerPadding = useMiniPlayerPadding();
  const [refreshing, setRefreshing] = useState(false);
  const [longPressItem, setLongPressItem] = useState<MediaLibraryItem | null>(null);
  const [longPressAnchor, setLongPressAnchor] = useState<AnchorRect | null>(null);

  const query = useMemo<ItemQuery>(
    () => ({
      userId,
      parentId: libraryId,
      kinds: tab.kinds !== undefined ? [...tab.kinds] : undefined,
      filters: tab.filters !== undefined ? [...tab.filters] : undefined,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      recursive: tab.recursive,
      startIndex: 0,
      limit: PAGE_SIZE,
    }),
    [userId, libraryId, tab.kinds, tab.filters, tab.recursive, sort.sortBy, sort.sortOrder]
  );

  const wallKey = useMemo(
    () => wallKeyOf(serverId, userId, libraryId, query, tab.id),
    [serverId, userId, libraryId, query, tab.id]
  );
  const slice = useBrowseStore((state) => state.walls[wallKey]);

  useEffect(() => {
    useBrowseStore.getState().actions.loadWallPage(wallKey, query, true);
  }, [wallKey, query]);

  useFocusEffect(
    useCallback(() => {
      void useBrowseStore.getState().actions.refreshWall(wallKey, query);
    }, [wallKey, query])
  );

  const handleEndReached = useCallback(() => {
    const current = useBrowseStore.getState().walls[wallKey];
    if (current === undefined || current.status !== 'READY' || current.startIndex >= current.total) {
      return;
    }
    useBrowseStore.getState().actions.loadWallPage(
      wallKey,
      { ...query, startIndex: current.items.length },
      false
    );
  }, [wallKey, query]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await useBrowseStore.getState().actions.loadWallPage(wallKey, query, true);
    } finally {
      setRefreshing(false);
    }
  }, [wallKey, query]);

  const favoriteViewActive = tab.filters?.includes('IsFavorite') ?? false;

  const handleToggleFavorite = useCallback(
    (item: MediaLibraryItem) => {
      const nextFavorite = !item.userData.favorite;
      const previous = useBrowseStore
        .getState()
        .actions.patchItemFavorite(wallKey, item.id, nextFavorite);
      markService.setFavorite(item.id, nextFavorite).catch((err: unknown) => {
        if (previous !== null) {
          useBrowseStore.getState().actions.patchItemFavorite(wallKey, item.id, previous);
        }
        toastError(err);
      });
    },
    [wallKey]
  );

  const handleLongPressCell = useCallback((item: MediaLibraryItem, anchor: AnchorRect) => {
    setLongPressItem(item);
    setLongPressAnchor(anchor);
  }, []);

  const handleCloseLongPressMenu = useCallback(() => {
    setLongPressItem(null);
    setLongPressAnchor(null);
  }, []);

  const handleLongPressPlayedChange = useCallback(
    (item: MediaLibraryItem, played: boolean) => {
      useBrowseStore.getState().actions.patchItemPlayed(wallKey, item.id, played);
    },
    [wallKey]
  );

  const handleLongPressFavoriteChange = useCallback(
    (item: MediaLibraryItem, favorite: boolean) => {
      useBrowseStore.getState().actions.patchItemFavorite(wallKey, item.id, favorite);
    },
    [wallKey]
  );

  const handleLongPressDeleted = useCallback(
    (item: MediaLibraryItem) => {
      useBrowseStore.getState().actions.removeWallItem(wallKey, item.id);
    },
    [wallKey]
  );

  const showClearView =
    onClearFilter !== undefined &&
    (favoriteViewActive ||
      tab.filters?.includes('IsPlayed') === true ||
      tab.filters?.includes('IsUnplayed') === true);

  if (slice === undefined || slice.status === 'LOADING') {
    return <LoadingView />;
  }
  if (slice.status === 'ERROR') {
    return (
      <ErrorView
        error={new AppError(slice.errorCode ?? 'UNKNOWN')}
        onRetry={() => useBrowseStore.getState().actions.loadWallPage(wallKey, query, true)}
      />
    );
  }

  return (
    <View style={styles.fill}>
      <FlashList
        data={slice.items}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) =>
          item.type === 'Folder' ? (
            <View style={styles.gridCell}>
              <FolderCard item={item} sort={sort} />
            </View>
          ) : (
            <WallGridCell
              item={item}
              dimmed={favoriteViewActive && !item.userData.favorite}
              onPress={() => navigateTabItem(navigation, tab.tap, item)}
              onLongPress={handleLongPressCell}
              onToggleFavorite={favoriteViewActive ? handleToggleFavorite : undefined}
            />
          )
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={PAGE_END_THRESHOLD}
        ListEmptyComponent={
          <EmptyView
            title={emptyTitleOf(tab, tr)}
            actionLabel={showClearView ? tr('library.viewAll') : undefined}
            onAction={showClearView ? onClearFilter : undefined}
          />
        }
        ListFooterComponent={
          slice.status === 'LOADING_MORE' ? (
            <ActivityIndicator style={styles.footer} color={t.accent} />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={t.accent}
          />
        }
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: SPACING.xl + miniPlayerPadding },
        ]}
      />
      <ItemActionMenu
        item={longPressItem}
        anchor={longPressAnchor}
        onClose={handleCloseLongPressMenu}
        onPlayedChange={handleLongPressPlayedChange}
        onFavoriteChange={handleLongPressFavoriteChange}
        onDeleted={handleLongPressDeleted}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.s, paddingBottom: SPACING.xl },
    gridCell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
    footer: { paddingVertical: SPACING.l },
  });
