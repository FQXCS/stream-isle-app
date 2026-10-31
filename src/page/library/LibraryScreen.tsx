/**
 * 库内容页（M1 文档 §4.10 Library 海报墙 / S10 + 04 §4.4 收藏联动；M5 §4.12 类型分发）：
 * MUSIC → MusicLibraryScreen 四区布局；PHOTO → PhotoLibraryScreen 相册布局；
 * 视频库（MOVIE/TVSHOW/MIXED）三列海报墙 + 服务端分页（40/页、滚动到底自动加载至 total 尽头）
 * + 类型/排序/筛选切换即重置重拉 + 下拉刷新。
 * M4 增量：卡片点击直达 Item 详情（复用 M2 路由）；收藏筛选下收藏角标 toggle——
 * 取消收藏卡片淡化置灰而非立即移除（避免服务端分页索引跳动），下拉刷新后自然收敛（04 §4.4）；
 * 筛选无结果 EmptyView 提供「清除筛选」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import type { ItemQuery, MediaLibrary, MediaLibraryItem, MediaItemTypeEnum, SortByEnum } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { FilterSheet } from '@/component/FilterSheet';
import { LoadingView } from '@/component/LoadingView';
import { PosterCard } from '@/component/PosterCard';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { showToast } from '@/component/Toast';
import {
  GRID_COLUMNS,
  PAGE_END_THRESHOLD,
  PAGE_SIZE,
  SORT_OPTIONS,
} from '@/constant/browse';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { errorMessageOf, AppError } from '@/infra/error';
import { markService } from '@/service/MarkService';
import { librariesKeyOf, useBrowseStore, wallKeyOf } from '@/store/browseStore';
import { useAccountStore } from '@/store/accountStore';
import { MusicLibraryScreen } from '@/page/library/MusicLibraryScreen';
import { PhotoLibraryScreen } from '@/page/photo/PhotoLibraryScreen';
import type { RootStackParamList } from '@/page/navigation/types';

type WallNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 混合库类型选择 → ItemQuery.kinds（§4.10：全部=Movie,Series 显式传两种，不传空） */
function kindsOfKindSelection(kind: 'Movie' | 'Series' | null): MediaItemTypeEnum[] {
  if (kind === 'Movie') {
    return ['Movie'];
  }
  if (kind === 'Series') {
    return ['Series'];
  }
  return ['Movie', 'Series'];
}

/** 筛选状态（页面本地，§4.10：route.params.library + 本地筛选状态） */
interface WallFilterState {
  /** MIXED 库类型 chips（null=全部）；MOVIE/TVSHOW 库不使用 */
  kind: 'Movie' | 'Series' | null;
  sortBy: SortByEnum;
  filter: 'IsUnplayed' | 'IsPlayed' | 'IsFavorite' | null;
}

export function LibraryScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  // native-stack 路由参数：LibrariesScreen 导航传入的库对象（RootStackParamList 类型保证）
  const route = useRoute<{ key: string; name: string; params: { library: MediaLibrary } }>();
  const library = route.params.library;
  const active = useAccountStore((state) => state.active);
  const accountKey = active ? librariesKeyOf(active.serverId, active.userId) : '';

  // 账号键参与 wallKey；账号切换时整体重挂载保证筛选状态干净
  return <LibraryBody key={accountKey} library={library} accountKey={accountKey} />;
}

interface LibraryBodyProps {
  library: MediaLibrary;
  accountKey: string;
}

function LibraryBody({ library, accountKey }: LibraryBodyProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<WallNavigationProp>();
  const [filterState, setFilterState] = useState<WallFilterState>(() => ({
    kind: null,
    // 默认排序取 SORT_OPTIONS 首项（SORT_NAME），方向取其 defaultOrder
    sortBy: SORT_OPTIONS[0].value,
    filter: null,
  }));
  const [refreshing, setRefreshing] = useState(false);
  // 迷你条让位（05 §4.10）：音频活跃时海报墙底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();

  const isMixed = library.type === 'MIXED';

  const [serverId, userId] = useMemo(() => accountKey.split(':'), [accountKey]);

  // kinds 取值规则（无空数组态，§4.10）：MOVIE 库固定 Movie；TVSHOW 固定 Series；MIXED 由 chips 决定
  const kinds: MediaItemTypeEnum[] = useMemo(() => {
    if (library.type === 'MOVIE') {
      return ['Movie'];
    }
    if (library.type === 'TVSHOW') {
      return ['Series'];
    }
    return kindsOfKindSelection(filterState.kind);
  }, [library.type, filterState.kind]);

  // 当前排序方向：按 SORT_OPTIONS 的 defaultOrder（RANDOM 忽略升降序 → 不传）
  const sortOrder = useMemo<'ASC' | 'DESC' | undefined>(() => {
    const option = SORT_OPTIONS.find((item) => item.value === filterState.sortBy);
    return option?.defaultOrder ?? undefined;
  }, [filterState.sortBy]);

  const firstPageQuery: ItemQuery = useMemo(
    () => ({
      userId,
      parentId: library.id,
      kinds,
      sortBy: filterState.sortBy,
      sortOrder,
      // filters 取值（§4.10，服务器 Filters 原值）：全部=不传
      filters: filterState.filter !== null ? [filterState.filter] : undefined,
      startIndex: 0,
      limit: PAGE_SIZE,
    }),
    [userId, library.id, kinds, filterState.sortBy, sortOrder, filterState.filter]
  );

  // 缓存键（§4.8 规范化），筛选/排序变化 → 键变化 → effect 重新拉取
  const wallKey = useMemo(
    () => wallKeyOf(serverId, userId, library.id, firstPageQuery),
    [serverId, userId, library.id, firstPageQuery]
  );
  const slice = useBrowseStore((state) => state.walls[wallKey]);

  // 挂载与筛选变化：重置拉第一页
  useEffect(() => {
    useBrowseStore.getState().actions.loadWallPage(wallKey, firstPageQuery, true);
  }, [wallKey, firstPageQuery]);

  /** 滚动到底自动翻页（status=READY 且 startIndex < total，§4.10） */
  const handleEndReached = useCallback(() => {
    const current = useBrowseStore.getState().walls[wallKey];
    if (current === undefined || current.status !== 'READY' || current.startIndex >= current.total) {
      return;
    }
    // 追加页起点取现有去重后条目数（随机排序去重后长度可能小于请求序号，§7 风险 7）
    const nextStart = current.items.length;
    useBrowseStore.getState().actions.loadWallPage(
      wallKey,
      { ...firstPageQuery, startIndex: nextStart },
      false
    );
  }, [wallKey, firstPageQuery]);

  /** 下拉刷新：重置重拉 */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await useBrowseStore.getState().actions.loadWallPage(wallKey, firstPageQuery, true);
    } finally {
      setRefreshing(false);
    }
  }, [wallKey, firstPageQuery]);

  /** 排序切换（重置重拉由 wallKey 变化触发） */
  const handleSelectSort = useCallback((sortBy: SortByEnum) => {
    setFilterState((state) => ({ ...state, sortBy }));
  }, []);

  /** 筛选切换 */
  const handleSelectFilter = useCallback(
    (filter: 'IsUnplayed' | 'IsPlayed' | 'IsFavorite' | null) => {
      setFilterState((state) => ({ ...state, filter }));
    },
    []
  );

  /** 混合库类型切换 */
  const handleSelectKind = useCallback((kind: 'Movie' | 'Series' | null) => {
    setFilterState((state) => ({ ...state, kind }));
  }, []);

  /**
   * 收藏 toggle（04 §4.4，仅收藏筛选下渲染角标）：乐观更新——先本地翻转 userData.favorite
   * （卡片淡化置灰不移除，避免服务端分页索引跳动），失败回滚 + Toast；成功态下拉刷新后
   * 由服务器结果自然收敛。
   */
  const handleToggleFavorite = useCallback(
    (item: MediaLibraryItem) => {
      const nextFavorite = !item.userData.favorite;
      const previous = useBrowseStore
        .getState()
        .actions.patchItemFavorite(wallKey, item.id, nextFavorite);
      markService.setFavorite(item.id, nextFavorite).catch((err: unknown) => {
        // 失败回滚（previous 为 null 表示条目不在缓存，无需回滚）
        if (previous !== null) {
          useBrowseStore.getState().actions.patchItemFavorite(wallKey, item.id, previous);
        }
        const code = err instanceof AppError ? err.code : 'UNKNOWN';
        showToast(errorMessageOf(code), 'error');
      });
    },
    [wallKey]
  );

  // M5 类型分发（05 §4.12，按 MediaLibrary.type 枚举）：MUSIC 四区 / PHOTO 相册 / 其余海报墙
  if (library.type === 'MUSIC') {
    return <MusicLibraryScreen library={library} />;
  }
  if (library.type === 'PHOTO') {
    return <PhotoLibraryScreen libraryId={library.id} />;
  }

  if (slice === undefined || slice.status === 'LOADING') {
    return (
      <View style={styles.fill}>
        <LoadingView />
      </View>
    );
  }

  if (slice.status === 'ERROR') {
    return (
      <View style={styles.fill}>
        <ErrorView
          error={new AppError(slice.errorCode ?? 'UNKNOWN')}
          onRetry={() =>
            useBrowseStore.getState().actions.loadWallPage(wallKey, firstPageQuery, true)
          }
        />
      </View>
    );
  }

  // 收藏筛选下渲染收藏角标按钮（04 §4.4 联动入口），其余筛选不渲染保持 M1 行为
  const favoriteFilterActive = filterState.filter === 'IsFavorite';

  return (
    <View style={styles.fill}>
      <FilterSheet
        sortBy={filterState.sortBy}
        filter={filterState.filter}
        kind={filterState.kind}
        showKindRow={isMixed}
        onSelectSort={handleSelectSort}
        onSelectFilter={handleSelectFilter}
        onSelectKind={handleSelectKind}
      />
      <FlashList
        data={slice.items}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: (typeof slice.items)[number] }) => (
          <Pressable onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}>
            <PosterCard
              item={item}
              // 收藏筛选下已取消收藏的卡片淡化置灰（04 §4.4）
              dimmed={favoriteFilterActive && !item.userData.favorite}
              onToggleFavorite={
                favoriteFilterActive ? (wallItem) => handleToggleFavorite(wallItem) : undefined
              }
            />
          </Pressable>
        )}
        contentContainerStyle={[styles.gridContent, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
        onEndReached={handleEndReached}
        onEndReachedThreshold={PAGE_END_THRESHOLD}
        ListEmptyComponent={
          favoriteFilterActive ? (
            // 收藏筛选无结果：提供「清除筛选」（04 §4.4）
            <EmptyView
              title="暂无收藏内容"
              actionLabel="清除筛选"
              onAction={() => handleSelectFilter(null)}
            />
          ) : (
            <EmptyView title="库内暂无条目" />
          )
        }
        ListFooterComponent={
          slice.status === 'LOADING_MORE' ? (
            <ActivityIndicator style={styles.footer} color={t.accent} />
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.accent} />
        }
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  gridContent: { paddingHorizontal: SPACING.m, paddingBottom: SPACING.xl },
  footer: { paddingVertical: SPACING.l },
});
