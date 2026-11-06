/**
 * 相册网格 Tab：相册卡片 → 本 Tab 内下钻照片网格；返回键回相册列表。
 */
import { useCallback, useEffect, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS } from '@/constant/browse';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';
import { fetchPhotoAlbumPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';

interface PhotoAlbumGridTabProps {
  libraryId: string;
  sort: LibrarySortState;
}

export function PhotoAlbumGridTab({ libraryId, sort }: PhotoAlbumGridTabProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const miniPlayerPadding = useMiniPlayerPadding();
  const [selectedAlbum, setSelectedAlbum] = useState<MediaLibraryItem | null>(null);
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchPhotoAlbumPage(libraryId, page, sort),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [libraryId, sort.sortBy, sort.sortOrder]
    )
  );

  useEffect(() => {
    if (selectedAlbum === null) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedAlbum(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedAlbum]);

  if (selectedAlbum !== null) {
    return (
      <PhotoGridScreen
        key={selectedAlbum.id}
        parentId={selectedAlbum.id}
        title={selectedAlbum.name}
        sort={sort}
        emptyTitle={tr('library.emptyAlbum')}
      />
    );
  }
  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (state.itemList.length === 0) {
    return <EmptyView title={tr('library.emptyPhotoAlbums')} />;
  }
  return (
    <FlashList
      data={state.itemList}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable style={styles.gridCell} onPress={() => setSelectedAlbum(item)}>
          <PosterCard
            item={item}
            subtextOverride={
              item.childCount !== undefined
                ? tr('library.photoCount', { count: item.childCount })
                : undefined
            }
          />
        </Pressable>
      )}
      onEndReached={state.loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        state.loading && state.page > 0 ? (
          <ActivityIndicator style={styles.footer} color={t.accent} />
        ) : null
      }
      contentContainerStyle={[
        styles.gridContent,
        { paddingBottom: SPACING.xl + miniPlayerPadding },
      ]}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.s, paddingBottom: SPACING.xl },
    gridCell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
    footer: { paddingVertical: SPACING.l },
  });
