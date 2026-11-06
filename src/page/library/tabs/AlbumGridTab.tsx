/**
 * 专辑网格 Tab：三列海报 + 分页，点击进 AlbumDetail(album)。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import type { RootStackParamList } from '@/page/navigation/types';
import { fetchAlbumPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';

type AlbumNavigation = NativeStackNavigationProp<RootStackParamList>;

interface AlbumGridTabProps {
  libraryId: string;
  sort: LibrarySortState;
}

export function AlbumGridTab({ libraryId, sort }: AlbumGridTabProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<AlbumNavigation>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchAlbumPage(libraryId, page, sort),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [libraryId, sort.sortBy, sort.sortOrder]
    )
  );

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
    return <EmptyView title={tr('library.emptyAlbums')} />;
  }
  return (
    <FlashList
      data={state.itemList}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable
          style={styles.gridCell}
          onPress={() => navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'album', itemId: item.id })}
        >
          <PosterCard item={item} />
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
