/**
 * 库内目录浏览器（库页「文件夹」Tab 根层与文件夹下钻路由共用）：
 * 视频/图书走海报墙目录，音乐/有声书复用 MusicFolderView，照片库复用 PhotoFolderView；
 * 点击文件夹/相册 push 新的 LibraryFolder 路由（原生滑动转场 + 文件夹名标题）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import type { ItemQuery, LibraryTypeEnum, MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { LoadingView } from '@/component/LoadingView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS, PAGE_END_THRESHOLD, PAGE_SIZE } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { FolderCard } from '@/page/library/components/FolderCard';
import { MusicFolderView } from '@/page/library/components/MusicFolderView';
import { WallGridCell } from '@/page/library/components/WallGridCell';
import { navigateMediaItem } from '@/page/library/tabs/navigation';
import type { RootStackParamList } from '@/page/navigation/types';
import { PhotoFolderView } from '@/page/photo/PhotoFolderView';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';
import { useAccountStore } from '@/store/accountStore';
import { useBrowseStore, wallKeyOf } from '@/store/browseStore';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { visibleFolderItems } from '@/util/library';

type FolderNavigation = NativeStackNavigationProp<RootStackParamList>;

interface LibraryFolderBrowserProps {
  /** 所在媒体库 id（排序记忆键） */
  libraryId: string;
  libraryType: LibraryTypeEnum;
  /** 当前目录 id（库根或任意层文件夹） */
  containerId: string;
  sort: LibrarySortState;
  /** 目录墙缓存分区键（沿用所在 Tab 的 id） */
  tabId: string;
  /** 相册（照片库专辑）直接用照片网格展示 */
  album?: boolean;
}

export function LibraryFolderBrowser({
  libraryId,
  libraryType,
  containerId,
  sort,
  tabId,
  album = false,
}: LibraryFolderBrowserProps) {
  const tr = useT();
  if (libraryType === 'MUSIC' || libraryType === 'AUDIOBOOK') {
    return (
      <MusicFolderBrowser
        libraryId={libraryId}
        libraryType={libraryType}
        containerId={containerId}
        sort={sort}
        tabId={tabId}
      />
    );
  }
  if (libraryType === 'PHOTO') {
    if (album) {
      return (
        <PhotoGridScreen parentId={containerId} sort={sort} emptyTitle={tr('library.emptyAlbum')} />
      );
    }
    return (
      <PhotoFolderBrowser
        libraryId={libraryId}
        libraryType={libraryType}
        containerId={containerId}
        sort={sort}
        tabId={tabId}
      />
    );
  }
  return (
    <PosterFolderBrowser
      libraryId={libraryId}
      libraryType={libraryType}
      containerId={containerId}
      sort={sort}
      tabId={tabId}
    />
  );
}

interface FolderBrowserProps {
  libraryId: string;
  libraryType: LibraryTypeEnum;
  containerId: string;
  sort: LibrarySortState;
  tabId: string;
}

interface OpenFolderTarget {
  libraryId: string;
  libraryType: LibraryTypeEnum;
  sort: LibrarySortState;
  tabId: string;
  item: MediaLibraryItem;
  kind: 'folder' | 'album';
}

function useOpenFolder() {
  const navigation = useNavigation<FolderNavigation>();
  return useCallback(
    (target: OpenFolderTarget) => {
      navigation.push(ROUTES.LIBRARY_FOLDER, {
        libraryId: target.libraryId,
        libraryType: target.libraryType,
        folderId: target.item.id,
        folderName: target.item.name,
        tabId: target.tabId,
        sortBy: target.sort.sortBy,
        sortOrder: target.sort.sortOrder,
        kind: target.kind,
      });
    },
    [navigation]
  );
}

function MusicFolderBrowser({
  libraryId,
  libraryType,
  containerId,
  sort,
  tabId,
}: FolderBrowserProps) {
  const openFolder = useOpenFolder();
  const handleOpenFolder = useCallback(
    (folder: MediaLibraryItem) =>
      openFolder({ libraryId, libraryType, sort, tabId, item: folder, kind: 'folder' }),
    [openFolder, libraryId, libraryType, sort, tabId]
  );
  return (
    <MusicFolderView
      folderId={containerId}
      sortBy={sort.sortBy}
      sortOrder={sort.sortOrder}
      onOpenFolder={handleOpenFolder}
    />
  );
}

function PhotoFolderBrowser({
  libraryId,
  libraryType,
  containerId,
  sort,
  tabId,
}: FolderBrowserProps) {
  const openFolder = useOpenFolder();
  const handleOpenFolder = useCallback(
    (folder: MediaLibraryItem) =>
      openFolder({ libraryId, libraryType, sort, tabId, item: folder, kind: 'folder' }),
    [openFolder, libraryId, libraryType, sort, tabId]
  );
  const handleOpenAlbum = useCallback(
    (album: MediaLibraryItem) =>
      openFolder({ libraryId, libraryType, sort, tabId, item: album, kind: 'album' }),
    [openFolder, libraryId, libraryType, sort, tabId]
  );
  return (
    <PhotoFolderView
      parentId={containerId}
      sort={sort}
      onOpenFolder={handleOpenFolder}
      onOpenAlbum={handleOpenAlbum}
    />
  );
}

function PosterFolderBrowser({
  libraryId,
  libraryType,
  containerId,
  sort,
  tabId,
}: FolderBrowserProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<FolderNavigation>();
  const openFolder = useOpenFolder();
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
      parentId: containerId,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      recursive: false,
      startIndex: 0,
      limit: PAGE_SIZE,
    }),
    [userId, containerId, sort.sortBy, sort.sortOrder]
  );
  const wallKey = useMemo(
    () => wallKeyOf(serverId, userId, containerId, query, tabId),
    [serverId, userId, containerId, query, tabId]
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

  const listData = visibleFolderItems(slice.items);

  return (
    <View style={styles.fill}>
      <FlashList
        data={listData}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) =>
          item.type === 'Folder' ? (
            <Pressable
              style={styles.gridCell}
              onPress={() =>
                openFolder({ libraryId, libraryType, sort, tabId, item, kind: 'folder' })
              }
            >
              <FolderCard item={item} />
            </Pressable>
          ) : (
            <WallGridCell
              item={item}
              dimmed={false}
              onPress={() => navigateMediaItem(navigation, item)}
              onLongPress={handleLongPressCell}
            />
          )
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={PAGE_END_THRESHOLD}
        ListEmptyComponent={<EmptyView title={tr('library.emptyFolder')} />}
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
