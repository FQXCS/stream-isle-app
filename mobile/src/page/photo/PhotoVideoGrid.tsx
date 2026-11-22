/**
 * 通用视频网格（家庭视频库/条目列表共用）：三列网格 + 服务端分页，
 * 点封面进入调用方指定目标，长按弹出操作菜单（标记已看/收藏/删除）。
 */
import { useCallback, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { ItemActionMenu } from '@/component/ItemActionMenu';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { GRID_COLUMNS } from '@/constant/browse';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { WallGridCell } from '@/page/library/components/WallGridCell';

interface PhotoVideoGridProps {
  loadPage: (page: number) => Promise<{ items: MediaLibraryItem[]; total: number }>;
  onPressItem: (item: MediaLibraryItem) => void;
  emptyTitle?: string;
}

export function PhotoVideoGrid({ loadPage, onPressItem, emptyTitle }: PhotoVideoGridProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const miniPlayerPadding = useMiniPlayerPadding();
  const state = usePagedLoad<MediaLibraryItem>(loadPage);
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
    return <EmptyView title={emptyTitle ?? tr('photo.videoEmpty')} />;
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
            onPress={() => onPressItem(item)}
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
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: SPACING.xl + miniPlayerPadding },
        ]}
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
    gridContent: { paddingHorizontal: SPACING.s, paddingBottom: SPACING.xl },
    footer: { paddingVertical: SPACING.l },
  });
