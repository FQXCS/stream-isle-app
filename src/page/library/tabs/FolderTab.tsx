/**
 * 文件夹 Tab：视频/图书走海报墙目录下钻；音乐/有声书复用 MusicFolderView；
 * 照片库复用 PhotoFolderView（含相册下钻）。返回键逐级回退。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import type { ItemQuery, MediaLibrary, MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { LoadingView } from '@/component/LoadingView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS, PAGE_END_THRESHOLD, PAGE_SIZE } from '@/constant/browse';
import type { TabSpec } from '@/constant/libraryTabs';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { MusicFolderView } from '@/page/library/components/MusicFolderView';
import { FolderCard } from '@/page/library/components/FolderCard';
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

interface FolderTabProps {
  tab: TabSpec;
  library: MediaLibrary;
  sort: LibrarySortState;
}

export function FolderTab({ tab, library, sort }: FolderTabProps) {
  if (library.type === 'MUSIC' || library.type === 'AUDIOBOOK') {
    return <MusicFolderTab libraryId={library.id} sort={sort} />;
  }
  if (library.type === 'PHOTO') {
    return <PhotoFolderTab libraryId={library.id} sort={sort} />;
  }
  return <PosterFolderTab tab={tab} libraryId={library.id} sort={sort} />;
}

function MusicFolderTab({ libraryId, sort }: { libraryId: string; sort: LibrarySortState }) {
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const folderId = folderPath.length > 0 ? folderPath[folderPath.length - 1] : libraryId;

  useEffect(() => {
    if (folderPath.length === 0) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFolderPath((path) => path.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [folderPath.length]);

  return (
    <MusicFolderView
      key={folderId}
      folderId={folderId}
      sortBy={sort.sortBy}
      sortOrder={sort.sortOrder}
      onOpenFolder={(folder) => setFolderPath((path) => [...path, folder.id])}
    />
  );
}

interface PhotoFolderRef {
  id: string;
  name: string;
  kind: 'folder' | 'album';
}

function PhotoFolderTab({ libraryId, sort }: { libraryId: string; sort: LibrarySortState }) {
  const [folderPath, setFolderPath] = useState<PhotoFolderRef[]>([]);
  const current = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;

  useEffect(() => {
    if (folderPath.length === 0) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFolderPath((path) => path.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [folderPath.length]);

  if (current !== null && current.kind === 'album') {
    return (
      <PhotoGridScreen
        key={current.id}
        parentId={current.id}
        title={current.name}
        sort={sort}
        emptyTitle="相册为空"
      />
    );
  }

  return (
    <PhotoFolderView
      key={current?.id ?? libraryId}
      parentId={current?.id ?? libraryId}
      sort={sort}
      onOpenFolder={(folder) =>
        setFolderPath((path) => [...path, { id: folder.id, name: folder.name, kind: 'folder' }])
      }
      onOpenAlbum={(album) =>
        setFolderPath((path) => [...path, { id: album.id, name: album.name, kind: 'album' }])
      }
    />
  );
}

interface PosterFolderTabProps {
  tab: TabSpec;
  libraryId: string;
  sort: LibrarySortState;
}

function PosterFolderTab({ tab, libraryId, sort }: PosterFolderTabProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<FolderNavigation>();
  const active = useAccountStore((state) => state.active);
  const serverId = active?.serverId ?? '';
  const userId = active?.userId ?? '';
  const miniPlayerPadding = useMiniPlayerPadding();
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [longPressItem, setLongPressItem] = useState<MediaLibraryItem | null>(null);
  const [longPressAnchor, setLongPressAnchor] = useState<AnchorRect | null>(null);

  const containerId = folderPath.length > 0 ? folderPath[folderPath.length - 1] : libraryId;

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
    () => wallKeyOf(serverId, userId, containerId, query, tab.id),
    [serverId, userId, containerId, query, tab.id]
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

  useEffect(() => {
    if (folderPath.length === 0) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFolderPath((path) => path.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [folderPath.length]);

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
              onPress={() => setFolderPath((path) => [...path, item.id])}
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
        ListEmptyComponent={<EmptyView title="文件夹为空" />}
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
