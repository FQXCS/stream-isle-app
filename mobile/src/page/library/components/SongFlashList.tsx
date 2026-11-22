/**
 * 全部歌曲/热门歌曲列表（M5 文档 §4.12：SongFlashList = SongRow 的 FlashList 封装；
 * 点单曲的入队范围由页面经 onPressSong 决定；迷你条活跃时底部让位，M5 §4.10）。
 * 多选（音乐个人歌单二改）：selecting/isSongSelected 映射到行渲染，
 * 长按经 onLongPressSong 交页面进入多选态。
 */
import { FlashList } from '@shopify/flash-list';
import { StyleSheet } from 'react-native';

import type { AudioItem } from '@/adapter/model';
import { SongRow } from '@/component/SongRow';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';

interface SongFlashListProps {
  songList: AudioItem[];
  /** 点单曲回调（入队范围由页面决定；多选态下为切换选中） */
  onPressSong: (song: AudioItem) => void;
  /** 长按回调（页面进入多选态；不传则行长按无行为） */
  onLongPressSong?: (song: AudioItem) => void;
  /** 多选态（行渲染为勾选框样式） */
  selecting?: boolean;
  /** 多选态下判断本行是否选中 */
  isSongSelected?: (song: AudioItem) => boolean;
  onEndReached?: () => void;
  footer?: React.ReactElement | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function SongFlashList({
  songList,
  onPressSong,
  onLongPressSong,
  selecting = false,
  isSongSelected,
  onEndReached,
  footer,
  onRefresh,
  refreshing,
}: SongFlashListProps) {
  // 迷你条让位（M5 §4.10）：音频活跃时底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();
  return (
    <FlashList
      data={songList}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }: { item: AudioItem; index: number }) => (
        <SongRow
          song={item}
          indexNumber={index + 1}
          showDivider={index < songList.length - 1}
          selecting={selecting}
          selected={selecting ? (isSongSelected?.(item) ?? false) : false}
          onPress={() => onPressSong(item)}
          onLongPress={onLongPressSong !== undefined ? () => onLongPressSong(item) : undefined}
        />
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
