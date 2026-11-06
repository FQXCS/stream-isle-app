/**
 * 照片库「文件夹」段：目录逐级浏览（Items?Recursive=false，返回键回上一级，不设面包屑）。
 * 子目录与相册都在本段内下钻（不跳转其他筛选段）；目录内全是照片时直接交给照片网格展示；
 * 视频与零散照片统一进入条目详情页（详情页可播放/收藏/查看音视频信息）；视频卡片支持长按操作菜单。
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { GRID_COLUMNS } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { fetchFolderPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { FolderCard } from '@/page/library/components/FolderCard';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';
import { WallGridCell } from '@/page/library/components/WallGridCell';
import { visibleFolderItems } from '@/util/library';
import type { RootStackParamList } from '@/page/navigation/types';

type PhotoNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PhotoFolderViewProps {
  /** 当前目录 id（库根或子目录） */
  parentId: string;
  /** 排序（库页排序菜单） */
  sort: LibrarySortState;
  /** 进入子目录 */
  onOpenFolder: (folder: MediaLibraryItem) => void;
  /** 进入相册（本段内下钻到照片网格，不跳「图片」段） */
  onOpenAlbum: (album: MediaLibraryItem) => void;
}

export function PhotoFolderView({ parentId, sort, onOpenFolder, onOpenAlbum }: PhotoFolderViewProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<PhotoNavigationProp>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchFolderPage(parentId, page, sort),
      // 排序变化 → 重新拉取（原始值依赖，避免对象引用抖动）
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [parentId, sort.sortBy, sort.sortOrder]
    )
  );

  // 目录可见条目：剔除空文件夹（服务器无该过滤参数）
  const visibleList = useMemo(() => visibleFolderItems(state.itemList), [state.itemList]);
  // 纯照片目录：直接用照片网格（可全屏查看、按页续载），与「图片」段体验一致
  const onlyPhotos = visibleList.length > 0 && visibleList.every((item) => item.type === 'Photo');
  const { patchItem, removeItem } = state;
  /** 视频卡片长按菜单：目标条目 + 锚点（null=关闭） */
  const [longPressItem, setLongPressItem] = useState<MediaLibraryItem | null>(null);
  const [longPressAnchor, setLongPressAnchor] = useState<AnchorRect | null>(null);

  const handleLongPressCell = useCallback((item: MediaLibraryItem, anchor: AnchorRect) => {
    setLongPressItem(item);
    setLongPressAnchor(anchor);
  }, []);

  const handleCloseLongPressMenu = useCallback(() => {
    setLongPressItem(null);
    setLongPressAnchor(null);
  }, []);

  // 标记/收藏就地更新本地分页条目（失败由 ItemActionMenu 反向回调回滚）
  const handleLongPressPlayedChange = useCallback(
    (item: MediaLibraryItem, played: boolean) => {
      patchItem(item.id, (target) => ({
        ...target,
        userData: { ...target.userData, played },
      }));
    },
    [patchItem]
  );

  const handleLongPressFavoriteChange = useCallback(
    (item: MediaLibraryItem, favorite: boolean) => {
      patchItem(item.id, (target) => ({
        ...target,
        userData: { ...target.userData, favorite },
      }));
    },
    [patchItem]
  );

  const handleLongPressDeleted = useCallback(
    (item: MediaLibraryItem) => {
      removeItem(item.id);
    },
    [removeItem]
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
  if (onlyPhotos) {
    return <PhotoGridScreen parentId={parentId} sort={sort} emptyTitle={tr('photo.folderEmpty')} />;
  }
  if (visibleList.length === 0) {
    return <EmptyView title={tr('photo.folderEmpty')} />;
  }

  return (
    <>
      <FlashList
        data={visibleList}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) =>
          // 视频与库海报墙同款卡片：支持长按操作菜单
          item.type === 'Video' ? (
            <WallGridCell
              item={item}
              dimmed={false}
              onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
              onLongPress={handleLongPressCell}
            />
          ) : (
            <Pressable
              style={styles.gridCell}
              onPress={() => {
                if (item.type === 'Folder') {
                  onOpenFolder(item);
                  return;
                }
                if (item.type === 'PhotoAlbum') {
                  onOpenAlbum(item);
                  return;
                }
                navigation.navigate(ROUTES.ITEM, { itemId: item.id });
              }}
            >
              {item.type === 'Folder' ? <FolderCard item={item} /> : <PosterCard item={item} />}
            </Pressable>
          )
        }
        onEndReached={state.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          state.loading && state.page > 0 ? (
            <ActivityIndicator style={styles.footer} color={t.accent} />
          ) : null
        }
        contentContainerStyle={[styles.gridContent, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
      />
      <ItemActionMenu
        item={longPressItem}
        anchor={longPressAnchor}
        onClose={handleCloseLongPressMenu}
        onPlayedChange={handleLongPressPlayedChange}
        onFavoriteChange={handleLongPressFavoriteChange}
        onDeleted={handleLongPressDeleted}
      />
    </>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.s },
    gridCell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
    footer: { paddingVertical: SPACING.l },
  });
