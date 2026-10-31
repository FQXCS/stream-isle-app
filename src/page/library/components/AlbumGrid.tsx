/**
 * 专辑/歌单封面网格（M5 文档 §4.12：FlashList 3 列，单元格 PosterCard，副标题「艺人 · 年份」；
 * 分页复用海报墙口径 onEndReached；迷你条活跃时底部让位，05 §4.10）。
 */
import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { PosterCard } from '@/component/PosterCard';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { GRID_COLUMNS } from '@/constant/browse';

interface AlbumGridProps {
  items: MediaLibraryItem[];
  /** 点击进 AlbumDetail（album/playlist 态） */
  onPressItem: (item: MediaLibraryItem) => void;
  onEndReached: () => void;
  /** 底部加载指示 */
  footer?: React.ReactElement | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function AlbumGrid({ items, onPressItem, onEndReached, footer, onRefresh, refreshing }: AlbumGridProps) {
  // 迷你条让位（05 §4.10）：音频活跃时底部 padding 叠加迷你条高度，避免末行被遮
  const miniPlayerPadding = useMiniPlayerPadding();
  return (
    <FlashList
      data={items}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable onPress={() => onPressItem(item)}>
          <PosterCard item={item} />
        </Pressable>
      )}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={footer ?? null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + miniPlayerPadding }]}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 12 },
});
