/**
 * TV 海报墙网格（TV-m2 §4.1）：browseStore WallSlice 分页缓存消费，状态机与手机
 * PosterWallTab/PosterFolderBrowser 同构（挂载 loadWallPage / onEndReached 追加 /
 * 聚焦回页 refreshWall 静默重拉保滚动位），仅渲染层换 RN FlatList numColumns=TV 列数
 * （FlashList 不上 TV，TV 设计 §6.2/m0 已定）。
 * 焦点方案（m1 行焦点结论的网格版，验收 #4）：Tab 栏/标题经 listHeader 渲染于同一
 * FlatList（同纵向 ScrollView 子树，网格顶行 UP 可达——TV-m1-S3 arrowScroll 子树限制）；
 * 分页追加不卸载已挂载单元格、索引不变，焦点保持；Header 元素形式不重挂（TV-m1-S7）。
 * 单元格等宽统一帧（2:3 卡档比例；宽幅类型居中裁切，网格密度一致性优先——TV-m2 网格决策）。
 * 路由收口在调用方（onPressItem/onPressFolder 回调），本组件不感知导航。
 */
import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { ItemQuery, MediaLibraryItem } from '@/adapter/model';
import { PAGE_END_THRESHOLD } from '@/constant/browse';
import { AppError } from '@/infra/error';
import { visibleFolderItems } from '@/util/library';
import { useBrowseStore } from '@/store/browseStore';

import { TvEmptyView, TvErrorView, TvLoadingSkeleton } from '@tv/component/TvStateViews';
import { TvFolderCard } from '@tv/component/TvFolderCard';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TV_GRID_COLUMNS, TV_GRID_CONTENT_PADDING, TV_GRID_GAP } from '@tv/constant/library';
import { useTvGridCellWidth } from '@tv/util/useTvGridCellWidth';
import { TvPosterCard, TV_CARD_IMAGE_HEIGHT } from '@tv/page/home/TvPosterCard';

interface TvWallGridProps {
  /** 海报墙缓存键（wallKeyOf，调用方按 serverId/userId/容器/排序组装） */
  wallKey: string;
  /** 完整查询（startIndex=0 / limit=PAGE_SIZE；追加由本组件按 items.length 续页） */
  query: ItemQuery;
  /**
   * 网格 FlatList ListHeader（元素形式，TV-m1-S7：组件类型稳定防重挂）。
   * 库页传标题+Tab 栏（同 ScrollView 子树，网格顶行 UP 可达）；下钻页传标题。
   */
  listHeader?: ReactElement;
  emptyTitle: string;
  /** 非文件夹单元格 Enter 落地（TV 路由映射由调用方收口） */
  onPressItem(item: MediaLibraryItem): void;
  /** Folder 卡 Enter 逐级下钻（调用方 push LibraryFolder；文件 Tab 必传） */
  onPressFolder(item: MediaLibraryItem): void;
  /** 收藏筛选 Tab：未收藏条目淡化置灰（不立即移除） */
  dimUnfavorite?: boolean;
  /** 文件夹浏览：隐藏空文件夹（手机 PosterFolderBrowser 同口径） */
  hideEmptyFolders?: boolean;
}

export function TvWallGrid({
  wallKey,
  query,
  listHeader,
  emptyTitle,
  onPressItem,
  onPressFolder,
  dimUnfavorite = false,
  hideEmptyFolders = false,
}: TvWallGridProps) {
  const t = useTvTheme();
  const styles = createStyles();
  const slice = useBrowseStore((state) => state.walls[wallKey]);

  useEffect(() => {
    void useBrowseStore.getState().actions.loadWallPage(wallKey, query, true);
  }, [wallKey, query]);

  // 聚焦回页静默重拉（详情返回后已看/进度角标即时更新；不进 LOADING 态保滚动位）
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
    void useBrowseStore.getState().actions.loadWallPage(
      wallKey,
      { ...query, startIndex: current.items.length },
      false
    );
  }, [wallKey, query]);

  // 等宽单元帧：useTvGridCellWidth 共享口径（屏宽 − 外框 − 留白按列均分）
  const cellWidth = useTvGridCellWidth();

  const itemList = useMemo(
    () => (hideEmptyFolders ? visibleFolderItems(slice?.items ?? []) : (slice?.items ?? [])),
    [slice?.items, hideEmptyFolders]
  );

  // 错误态整页替换（重试钮 hasTVPreferredFocus 可达）；加载态**不**整页替换——
  // Header（Tab 栏）保持挂载以防焦点丢失（TV 无触摸兜底），骨架进 ListEmpty
  if (slice?.status === 'ERROR') {
    return (
      <TvErrorView
        error={new AppError(slice.errorCode ?? 'UNKNOWN')}
        onRetry={() => void useBrowseStore.getState().actions.loadWallPage(wallKey, query, true)}
      />
    );
  }
  const firstLoading = slice === undefined || slice.status === 'LOADING';

  return (
    <FlatList
      data={firstLoading ? [] : itemList}
      numColumns={TV_GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      // 元素形式（TV-m1-S7：内联箭头函数组件会因类型变化重挂触发焦点重放死循环）
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        firstLoading ? (
          <TvLoadingSkeleton />
        ) : (
          <View style={styles.empty}>
            <TvEmptyView title={emptyTitle} />
          </View>
        )
      }
      ListFooterComponent={
        slice?.status === 'LOADING_MORE' ? (
          <ActivityIndicator style={styles.footer} color={t.accent} />
        ) : undefined
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={PAGE_END_THRESHOLD}
      contentContainerStyle={styles.gridContent}
      renderItem={({ item }) =>
        item.type === 'Folder' ? (
          <View style={styles.cell}>
            <TvFolderCard
              item={item}
              frameWidth={cellWidth}
              sort={{ sortBy: query.sortBy ?? 'SORT_NAME', sortOrder: query.sortOrder ?? 'ASC' }}
              onPress={() => onPressFolder(item)}
            />
          </View>
        ) : (
          <View style={styles.cell}>
            <TvPosterCard
              item={item}
              frame={{ width: cellWidth, height: TV_CARD_IMAGE_HEIGHT }}
              dimmed={dimUnfavorite && !item.userData.favorite}
              onPress={() => onPressItem(item)}
            />
          </View>
        )
      }
    />
  );
}

const createStyles = () =>
  StyleSheet.create({
    gridContent: {
      paddingHorizontal: TV_GRID_CONTENT_PADDING,
      paddingBottom: 32,
    },
    cell: {
      flex: 1,
      alignItems: 'flex-start',
      paddingHorizontal: TV_GRID_GAP / 2,
      paddingBottom: TV_GRID_GAP,
    },
    empty: { flex: 1, minHeight: 400 },
    footer: { paddingVertical: 24 },
  });
