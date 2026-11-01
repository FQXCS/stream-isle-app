/**
 * 库内容页（M1 文档 §4.10 Library 海报墙 / S10 + 04 §4.4 收藏联动；M5 §4.12 类型分发）：
 * MUSIC → MusicLibraryScreen 三区布局；PHOTO → PhotoLibraryScreen 相册布局；
 * BOOK 与视频库（MOVIE/TVSHOW/MIXED）三列海报墙 + 服务端分页（40/页、滚动到底自动加载至 total 尽头）。
 * 顶部为分段控件视图段（互斥单选）：电影库 影片/收藏/未看/文件夹、剧集库 剧集/收藏/未看/文件夹、
 * 混合库 全部/电影/剧集/文件夹、图书库 书籍/文件夹；文件夹段为目录浏览（adapter 传 Recursive=false，
 * 子目录逐级进入，可返回上一级）。排序入口在导航栏右上角 SortMenu；切换视图/排序即重置重拉 + 下拉刷新。
 * M4 增量：卡片点击直达 Item 详情；收藏视图下收藏角标 toggle——取消收藏卡片淡化置灰而非立即移除
 * （避免服务端分页索引跳动），下拉刷新后自然收敛（04 §4.4）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
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

import type { ItemQuery, MediaLibrary, MediaLibraryItem, MediaItemTypeEnum, SortByEnum } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { LoadingView } from '@/component/LoadingView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { SegmentedControl } from '@/component/SegmentedControl';
import { SortMenu, SortMenuButton } from '@/component/SortMenu';
import { showToast } from '@/component/Toast';
import {
  GRID_COLUMNS,
  libraryViewOptionsOf,
  PAGE_END_THRESHOLD,
  PAGE_SIZE,
  SORT_OPTIONS,
  type LibraryViewEnum,
} from '@/constant/browse';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { errorMessageOf, AppError } from '@/infra/error';
import { markService } from '@/service/MarkService';
import { librariesKeyOf, useBrowseStore, wallKeyOf } from '@/store/browseStore';
import { useAccountStore } from '@/store/accountStore';
import {
  DEFAULT_LIBRARY_SORT,
  librarySortKeyOf,
  useLibraryViewStore,
} from '@/store/libraryViewStore';
import { visibleFolderItems } from '@/util/library';
import { MusicLibraryScreen } from '@/page/library/MusicLibraryScreen';
import { PhotoLibraryScreen } from '@/page/photo/PhotoLibraryScreen';
import { FolderCard } from '@/page/library/components/FolderCard';
import { WallGridCell } from '@/page/library/components/WallGridCell';
import type { RootStackParamList } from '@/page/navigation/types';

type WallNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 操作失败 Toast（文案取 ERROR_MESSAGE_MAP 唯一出处） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

export function LibraryScreen() {
  // native-stack 路由参数：LibrariesScreen 导航传入的库对象（RootStackParamList 类型保证）
  const route = useRoute<{ key: string; name: string; params: { library: MediaLibrary } }>();
  const library = route.params.library;
  const active = useAccountStore((state) => state.active);
  const accountKey = active ? librariesKeyOf(active.serverId, active.userId) : '';

  // M5 类型分发（05 §4.12，按 MediaLibrary.type 枚举）：MUSIC 三区 / PHOTO 相册 / 其余海报墙
  if (library.type === 'MUSIC') {
    return <MusicLibraryScreen library={library} />;
  }
  if (library.type === 'PHOTO') {
    return <PhotoLibraryScreen libraryId={library.id} />;
  }

  // 账号键参与 wallKey；账号切换时整体重挂载保证视图状态干净
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
  const [serverId, userId] = useMemo(() => accountKey.split(':'), [accountKey]);
  // 排序持久化键：每个库记住自己的排序（重进库页默认沿用上次）
  const sortKey = librarySortKeyOf(serverId, library.id);
  const savedSort = useLibraryViewStore((state) => state.sortByKey[sortKey]);
  // 视图段（互斥单选；folder=目录浏览）
  const [view, setView] = useState<LibraryViewEnum>('all');
  // 文件夹浏览路径（空=库根目录；元素为进入过的子目录 id）
  const [folderPath, setFolderPath] = useState<string[]>([]);
  // 排序字段/方向（导航栏右上角 SortMenu；初值取该库上次保存的排序）
  const [sortBy, setSortBy] = useState<SortByEnum>(
    () => savedSort?.sortBy ?? DEFAULT_LIBRARY_SORT.sortBy
  );
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>(
    () => savedSort?.sortOrder ?? DEFAULT_LIBRARY_SORT.sortOrder
  );
  // 排序面板开合（页内浮层，渲染在列表之上）
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** 卡片长按菜单：目标条目 + 锚点（null=关闭；菜单出现在卡片下方） */
  const [longPressItem, setLongPressItem] = useState<MediaLibraryItem | null>(null);
  const [longPressAnchor, setLongPressAnchor] = useState<AnchorRect | null>(null);
  // 迷你条让位（05 §4.10）：音频活跃时海报墙底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();

  const isFolderView = view === 'folder';
  // 当前容器：文件夹浏览取路径末端，其余视图为库根
  const containerId =
    folderPath.length > 0 ? folderPath[folderPath.length - 1] : library.id;

  // 条目类型口径：folder 视图不限定类型（IncludeItemTypes 会把子目录 Folder 过滤掉）
  const kinds = useMemo<MediaItemTypeEnum[] | undefined>(() => {
    if (isFolderView) {
      return undefined;
    }
    if (view === 'movie') {
      return ['Movie'];
    }
    if (view === 'series') {
      return ['Series'];
    }
    if (library.type === 'MOVIE') {
      return ['Movie'];
    }
    if (library.type === 'TVSHOW') {
      return ['Series'];
    }
    if (library.type === 'BOOK') {
      return ['Book'];
    }
    return ['Movie', 'Series'];
  }, [isFolderView, view, library.type]);

  // 收藏/未看视图的服务器 Filters 原值（其余视图不传）
  const filters = useMemo<ItemQuery['filters']>(() => {
    if (view === 'favorite') {
      return ['IsFavorite'];
    }
    if (view === 'unplayed') {
      return ['IsUnplayed'];
    }
    return undefined;
  }, [view]);

  const firstPageQuery: ItemQuery = useMemo(
    () => ({
      userId,
      parentId: containerId,
      kinds,
      sortBy,
      sortOrder,
      filters,
      // 文件夹浏览只列当前层（Recursive=false）
      recursive: isFolderView ? false : undefined,
      startIndex: 0,
      limit: PAGE_SIZE,
    }),
    [userId, containerId, kinds, sortBy, sortOrder, filters, isFolderView]
  );

  // 缓存键（§4.8 规范化）：视图/排序/目录变化 → 键变化 → effect 重新拉取
  const wallKey = useMemo(
    () => wallKeyOf(serverId, userId, containerId, firstPageQuery),
    [serverId, userId, containerId, firstPageQuery]
  );
  const slice = useBrowseStore((state) => state.walls[wallKey]);

  // 挂载与视图/排序/目录变化：重置拉第一页
  useEffect(() => {
    useBrowseStore.getState().actions.loadWallPage(wallKey, firstPageQuery, true);
  }, [wallKey, firstPageQuery]);

  // 聚焦静默刷新：详情页返回时已看/进度角标即时更新（保留列表与滚动位置，失败静默）
  useFocusEffect(
    useCallback(() => {
      void useBrowseStore.getState().actions.refreshWall(wallKey, firstPageQuery);
    }, [wallKey, firstPageQuery])
  );

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

  /** 视图切换：回到库根目录 */
  const handleSelectView = useCallback((next: LibraryViewEnum) => {
    setView(next);
    setFolderPath([]);
  }, []);

  /** 进入子文件夹 */
  const handleOpenFolder = useCallback((folder: MediaLibraryItem) => {
    setFolderPath((path) => [...path, folder.id]);
  }, []);

  /** 返回上一级目录 */
  const handleFolderUp = useCallback(() => {
    setFolderPath((path) => path.slice(0, -1));
  }, []);

  // 文件夹浏览中按系统返回键先回上一级（库根目录时交回导航栈退出库页）
  useEffect(() => {
    if (!isFolderView || folderPath.length === 0) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleFolderUp();
      return true;
    });
    return () => subscription.remove();
  }, [isFolderView, folderPath.length, handleFolderUp]);

  /**
   * 排序切换（关闭面板；重置重拉由 wallKey 变化触发）：
   * 选同一字段 = 切换升降序（随机等无方向字段不切换），选其他字段 = 用该字段默认方向；
   * 结果写入 libraryViewStore 持久化，下次进入该库默认沿用。
   */
  const handleSelectSort = useCallback(
    (next: SortByEnum) => {
      setSortMenuOpen(false);
      const option = SORT_OPTIONS.find((item) => item.value === next);
      let nextOrder: 'ASC' | 'DESC';
      if (next === sortBy) {
        if (option?.defaultOrder === null) {
          return;
        }
        nextOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        nextOrder = option?.defaultOrder ?? 'ASC';
      }
      setSortBy(next);
      setSortOrder(nextOrder);
      useLibraryViewStore.getState().actions.setLibrarySort(sortKey, {
        sortBy: next,
        sortOrder: nextOrder,
      });
    },
    [sortBy, sortOrder, sortKey]
  );

  const handleToggleSortMenu = useCallback(() => setSortMenuOpen((open) => !open), []);
  const handleCloseSortMenu = useCallback(() => setSortMenuOpen(false), []);

  // 排序入口注入导航栏右上角（库名居中标题在 RootNavigator 的 LIBRARY options 中）
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <SortMenuButton onPress={handleToggleSortMenu} />,
    });
  }, [navigation, handleToggleSortMenu]);

  /**
   * 收藏 toggle（04 §4.4，仅收藏视图下渲染角标）：乐观更新——先本地翻转 userData.favorite
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

  const favoriteViewActive = view === 'favorite';

  // —— 卡片长按菜单（M8 参考稿）：播放 / 下载 / 标记已看 / 收藏 / 删除 ——

  const handleLongPressCell = useCallback((item: MediaLibraryItem, anchor: AnchorRect) => {
    setLongPressItem(item);
    setLongPressAnchor(anchor);
  }, []);

  const handleCloseLongPressMenu = useCallback(() => {
    setLongPressItem(null);
    setLongPressAnchor(null);
  }, []);

  /** 长按菜单标记已看/未看：先就地翻转缓存，失败由 ItemActionMenu 反向回调回滚 */
  const handleLongPressPlayedChange = useCallback(
    (item: MediaLibraryItem, played: boolean) => {
      useBrowseStore.getState().actions.patchItemPlayed(wallKey, item.id, played);
    },
    [wallKey]
  );

  /** 长按菜单收藏/取消收藏：同上，就地翻转缓存 */
  const handleLongPressFavoriteChange = useCallback(
    (item: MediaLibraryItem, favorite: boolean) => {
      useBrowseStore.getState().actions.patchItemFavorite(wallKey, item.id, favorite);
    },
    [wallKey]
  );

  /** 长按菜单删除成功：摘除缓存条目 */
  const handleLongPressDeleted = useCallback(
    (item: MediaLibraryItem) => {
      useBrowseStore.getState().actions.removeWallItem(wallKey, item.id);
    },
    [wallKey]
  );

  // 排序面板（任何视图都渲染，避免加载期间点开后面板悬空）
  const sortMenu = sortMenuOpen ? (
    <SortMenu
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSelect={handleSelectSort}
      onClose={handleCloseSortMenu}
    />
  ) : null;

  // 空态文案：视图相关的「查看全部」快捷返回
  const emptyTitle = isFolderView
    ? '文件夹为空'
    : favoriteViewActive
      ? '暂无收藏内容'
      : view === 'unplayed'
        ? '暂无未看内容'
        : '库内暂无条目';
  const showClearView = favoriteViewActive || view === 'unplayed';

  // 列表数据：目录浏览时隐藏空文件夹（Folder 且 ChildCount=0，服务器无该过滤参数）
  const listData = useMemo<MediaLibraryItem[]>(() => {
    const itemList = slice?.items ?? [];
    return isFolderView ? visibleFolderItems(itemList) : itemList;
  }, [isFolderView, slice]);

  const listBody =
    slice === undefined || slice.status === 'LOADING' ? (
      <LoadingView />
    ) : slice.status === 'ERROR' ? (
      <ErrorView
        error={new AppError(slice.errorCode ?? 'UNKNOWN')}
        onRetry={() =>
          useBrowseStore.getState().actions.loadWallPage(wallKey, firstPageQuery, true)
        }
      />
    ) : (
      <FlashList
        data={listData}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) =>
          item.type === 'Folder' ? (
            // 文件夹视图的子目录：进入下一层（Recursive=false 逐级浏览）
            <Pressable style={styles.gridCell} onPress={() => handleOpenFolder(item)}>
              <FolderCard item={item} />
            </Pressable>
          ) : (
            <WallGridCell
              item={item}
              // 收藏视图下已取消收藏的卡片淡化置灰（04 §4.4）
              dimmed={favoriteViewActive && !item.userData.favorite}
              onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
              onLongPress={handleLongPressCell}
              onToggleFavorite={
                favoriteViewActive ? (wallItem) => handleToggleFavorite(wallItem) : undefined
              }
            />
          )
        }
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: SPACING.xl + miniPlayerPadding },
        ]}
        onEndReached={handleEndReached}
        onEndReachedThreshold={PAGE_END_THRESHOLD}
        ListEmptyComponent={
          <EmptyView
            title={emptyTitle}
            actionLabel={showClearView ? '查看全部' : undefined}
            onAction={showClearView ? () => handleSelectView('all') : undefined}
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
      />
    );

  return (
    <View style={styles.fill}>
      <SegmentedControl
        optionList={libraryViewOptionsOf(library.type)}
        value={view}
        onChange={handleSelectView}
      />
      {listBody}
      {sortMenu}
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
    // 网格单元留白：卡间 8pt、行间 12pt，外边距与卡间距协调
    gridCell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
    footer: { paddingVertical: SPACING.l },
  });
