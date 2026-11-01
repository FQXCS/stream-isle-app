/**
 * 照片库「视频」段（家庭视频/照片混合库）：库内 Video 条目的三列网格 + 服务端分页。
 * 点封面进入条目详情页（与视频库一致：详情页可播放、收藏、查看音视频信息）；长按卡片弹出操作菜单。
 */
import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { GRID_COLUMNS } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError } from '@/infra/error';
import { fetchVideoPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { WallGridCell } from '@/page/library/components/WallGridCell';
import type { RootStackParamList } from '@/page/navigation/types';

type PhotoNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PhotoVideoGridProps {
  libraryId: string;
  sort: LibrarySortState;
}

export function PhotoVideoGrid({ libraryId, sort }: PhotoVideoGridProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<PhotoNavigationProp>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchVideoPage(libraryId, page, sort),
      // 排序变化 → 重新拉取（sortBy/sortOrder 为原始值，避免对象引用抖动）
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [libraryId, sort.sortBy, sort.sortOrder]
    )
  );
  const { patchItem, removeItem } = state;
  /** 长按菜单：目标条目 + 锚点（null=关闭） */
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
  if (state.itemList.length === 0) {
    return <EmptyView title="暂无视频" />;
  }
  return (
    <>
      <FlashList
        data={state.itemList}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) => (
          <WallGridCell
            item={item}
            dimmed={false}
            onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
            onLongPress={handleLongPressCell}
          />
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
