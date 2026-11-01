/**
 * 照片库「文件夹」段：目录逐级浏览（Items?Recursive=false，返回键回上一级，不设面包屑）。
 * 子目录与相册都在本段内下钻（不跳转其他筛选段）；目录内全是照片时直接交给照片网格展示；
 * 视频点封面直接起播，混合目录里的零散照片进详情页兜底。
 */
import { useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { GRID_COLUMNS } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError } from '@/infra/error';
import { fetchFolderPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { FolderCard } from '@/page/library/components/FolderCard';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';
import { usePlayVideo } from '@/page/photo/usePlayVideo';
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
  const styles = createStyles(t);
  const navigation = useNavigation<PhotoNavigationProp>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const playVideo = usePlayVideo();
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
    return <PhotoGridScreen parentId={parentId} sort={sort} emptyTitle="文件夹为空" />;
  }
  if (visibleList.length === 0) {
    return <EmptyView title="文件夹为空" />;
  }

  return (
    <FlashList
      data={visibleList}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable
          onPress={() => {
            if (item.type === 'Folder') {
              onOpenFolder(item);
              return;
            }
            if (item.type === 'PhotoAlbum') {
              onOpenAlbum(item);
              return;
            }
            if (item.type === 'Video') {
              void playVideo(item);
              return;
            }
            navigation.navigate(ROUTES.ITEM, { itemId: item.id });
          }}
        >
          {item.type === 'Folder' ? <FolderCard item={item} /> : <PosterCard item={item} />}
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
