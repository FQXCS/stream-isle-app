/**
 * 全部歌曲/热门歌曲列表（M5 文档 §4.12：SongFlashList = SongRow 的 FlashList 封装；
 * 点单曲 = 当前已加载片段从被点曲起播入队，05 §4.12 入队语义表；迷你条活跃时底部让位，05 §4.10）。
 */
import { FlashList } from '@shopify/flash-list';
import { StyleSheet } from 'react-native';

import type { AudioItem } from '@/adapter/model';
import { SongRow } from '@/component/SongRow';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';

interface SongFlashListProps {
  songList: AudioItem[];
  /** 点单曲（页面按「所在列表从被点曲起播」入队） */
  onPressSong: (song: AudioItem, index: number) => void;
  onEndReached?: () => void;
  footer?: React.ReactElement | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function SongFlashList({
  songList,
  onPressSong,
  onEndReached,
  footer,
  onRefresh,
  refreshing,
}: SongFlashListProps) {
  // 迷你条让位（05 §4.10）：音频活跃时底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();
  return (
    <FlashList
      data={songList}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }: { item: AudioItem; index: number }) => (
        <SongRow song={item} onPress={() => onPressSong(item, index)} />
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
  content: {},
});
