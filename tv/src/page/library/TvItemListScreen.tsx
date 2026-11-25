/**
 * TV 通用条目列表页（TV-m2 §4.2）：合集子项等列表，点击按条目类型落地（tvNavigateMediaItem）。
 * 数据链路照搬手机 usePagedLoad 模式（hook 住在 @/page 禁入，TV 侧按同型页面局部 state
 * 重写、不进 browseStore）：SORT_NAME ASC 服务端分页，聚焦重载、滚动到底追加。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { ItemQuery, MediaLibraryItem } from '@/adapter/model';
import { PAGE_END_THRESHOLD, PAGE_SIZE } from '@/constant/browse';
import { AppError, type AppErrorCode } from '@/infra/error';
import { useT } from '@/i18n';
import { fetchWallPage } from '@/service/BrowseService';
import { useAccountStore } from '@/store/accountStore';

import { TvEmptyView, TvErrorView, TvLoadingSkeleton } from '@tv/component/TvStateViews';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TV_GRID_COLUMNS, TV_GRID_CONTENT_PADDING, TV_GRID_GAP } from '@tv/constant/library';
import { useTvGridCellWidth } from '@tv/util/useTvGridCellWidth';
import { tvNavigateMediaItem } from '@tv/page/library/navigation';
import type { TvItemListParams, TvStackParamList } from '@tv/navigation/types';
import { TvPosterCard, TV_CARD_IMAGE_HEIGHT } from '@tv/page/home/TvPosterCard';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

/** 页面局部分页状态（usePagedLoad 同构，M5 §4.7 口径：不进 browseStore） */
interface PagedLocalState {
  itemList: MediaLibraryItem[];
  total: number;
  page: number;
  loading: boolean;
  errorCode: AppErrorCode | null;
}

const INITIAL_PAGED: PagedLocalState = {
  itemList: [],
  total: 0,
  page: -1,
  loading: true,
  errorCode: null,
};

export function TvItemListScreen() {
  const route = useRoute<{ key: string; name: string; params: TvItemListParams }>();
  const { title, parentId, kinds, filters } = route.params;
  const navigation = useNavigation<TvNavigation>();
  const tr = useT();
  const t = useTvTheme();
  const cellWidth = useTvGridCellWidth();
  const userId = useAccountStore((state) => state.active?.userId ?? '');
  const [state, setState] = useState<PagedLocalState>(INITIAL_PAGED);

  // SORT_NAME ASC 固定排序分页（手机 ItemListScreen 同口径）
  const loadPage = useCallback(
    (page: number) =>
      fetchWallPage({
        userId,
        parentId,
        kinds,
        filters,
        sortBy: 'SORT_NAME',
        sortOrder: 'ASC',
        startIndex: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      } satisfies ItemQuery),
    [userId, parentId, kinds, filters]
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      setState((prev) => ({ ...prev, loading: true, errorCode: null }));
      try {
        const result = await loadPage(targetPage);
        setState((prev) => ({
          itemList: targetPage === 0 ? result.items : [...prev.itemList, ...result.items],
          total: result.total,
          page: targetPage,
          loading: false,
          errorCode: null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          errorCode: err instanceof AppError ? err.code : 'UNKNOWN',
        }));
      }
    },
    [loadPage]
  );

  // 聚焦重载（页面局部 state + useFocusEffect 聚焦刷新，手机 usePagedLoad 同口径）
  useFocusEffect(
    useCallback(() => {
      void fetchPage(0);
    }, [fetchPage])
  );

  const handleEndReached = useCallback(() => {
    if (state.loading || state.itemList.length >= state.total) {
      return;
    }
    void fetchPage(state.page + 1);
  }, [state, fetchPage]);

  if (state.loading && state.page === -1) {
    return (
      <TvScreenFrame>
        <TvLoadingSkeleton />
      </TvScreenFrame>
    );
  }
  if (state.errorCode !== null) {
    return (
      <TvScreenFrame>
        <TvErrorView
          error={new AppError(state.errorCode)}
          onRetry={() => void fetchPage(0)}
        />
      </TvScreenFrame>
    );
  }

  return (
    <TvScreenFrame>
      <FlatList
        data={state.itemList}
        numColumns={TV_GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Text style={[styles.title, { color: t.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <TvEmptyView title={tr('itemList.empty', { title })} />
          </View>
        }
        ListFooterComponent={
          state.loading && state.page >= 0 ? (
            <ActivityIndicator style={styles.footer} color={t.accent} />
          ) : undefined
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={PAGE_END_THRESHOLD}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <TvPosterCard
              item={item}
              frame={{ width: cellWidth, height: TV_CARD_IMAGE_HEIGHT }}
              onPress={() => tvNavigateMediaItem(navigation, item)}
            />
          </View>
        )}
      />
    </TvScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  gridContent: { paddingHorizontal: TV_GRID_CONTENT_PADDING, paddingBottom: 32 },
  cell: {
    flex: 1,
    alignItems: 'flex-start',
    paddingHorizontal: TV_GRID_GAP / 2,
    paddingBottom: TV_GRID_GAP,
  },
  empty: { flex: 1, minHeight: 400 },
  footer: { paddingVertical: 24 },
});
