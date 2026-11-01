/**
 * 照片库「视频」段（家庭视频/照片混合库）：库内 Video 条目的三列网格 + 服务端分页。
 * 点封面直接起播（resolve → 播放页），与家庭视频的使用场景一致。
 */
import { useCallback } from 'react';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { GRID_COLUMNS } from '@/constant/browse';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError } from '@/infra/error';
import { fetchVideoPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { usePlayVideo } from '@/page/photo/usePlayVideo';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';

interface PhotoVideoGridProps {
  libraryId: string;
  sort: LibrarySortState;
}

export function PhotoVideoGrid({ libraryId, sort }: PhotoVideoGridProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const miniPlayerPadding = useMiniPlayerPadding();
  const playVideo = usePlayVideo();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchVideoPage(libraryId, page, sort),
      // 排序变化 → 重新拉取（sortBy/sortOrder 为原始值，避免对象引用抖动）
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
    return <EmptyView title="暂无视频" />;
  }
  return (
    <FlashList
      data={state.itemList}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable onPress={() => void playVideo(item)}>
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
      contentContainerStyle={[styles.gridContent, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.m },
    footer: { paddingVertical: SPACING.l },
  });
