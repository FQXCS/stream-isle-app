/**
 * 队列面板（M5 文档 §4.10/§4.11；NowPlaying 下区，默认收起）：
 * react-native-draggable-flatlist 长按拖动 → moveInQueue；行内删除按钮 → removeFromQueue；
 * 当前曲高亮，点击行 = skipToIndex。队列全量仅在面板打开时经
 * audioService.getQueueSnapshot() 拉取（UI 不直呼 TrackPlayer.*，§4.5 唯一入口约束），不进 store。
 */
import { useCallback, useState } from 'react';
import DraggableFlatList, { type DragEndParams } from 'react-native-draggable-flatlist';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { audioService, type AudioQueueEntry } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { SongRow } from '@/component/SongRow';
import { EmptyView } from '@/component/EmptyView';

/** 队列行渲染形态（AudioService 快照映射，不进 store） */
type QueueEntry = AudioQueueEntry;

export function QueuePanel() {
  const currentTrackId = usePlayerStore((state) => state.audio.currentTrack?.id ?? null);
  const [entryList, setEntryList] = useState<QueueEntry[] | null>(null);

  const reload = useCallback(async () => {
    setEntryList(await audioService.getQueueSnapshot());
  }, []);

  // 面板挂载/聚焦时重拉全量队列（真源在 track-player 原生侧）；
  // 切歌高亮由 currentTrackId 订阅直接驱动渲染，队列成分未变无需重拉
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const handleDragEnd = useCallback((params: DragEndParams<QueueEntry>) => {
    // 长按拖动 → moveInQueue（from → to 逐项映射；简化为成对提交，播放顺序即时跟随）
    const { from, to } = params;
    if (from !== to) {
      void audioService.moveInQueue(from, to);
      setEntryList((prev) => {
        if (prev === null) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    }
  }, []);

  if (entryList === null) {
    return <View style={styles.container} />;
  }
  if (entryList.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyView title="队列为空" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>队列（{entryList.length}）</Text>
      </View>
      <DraggableFlatList
        data={entryList}
        keyExtractor={(item) => item.id}
        onDragEnd={handleDragEnd}
        renderItem={({ item, drag, getIndex }) => {
          const index = getIndex() ?? 0;
          return (
            <SongRow
              song={{
                id: item.id,
                name: item.title,
                artistName: item.artist,
                coverImageUrl: item.coverUrl,
                runtimeMs: item.durationMs,
              }}
              indexNumber={index + 1}
              active={item.id === currentTrackId}
              onPress={() => {
                void audioService.skipToIndex(index);
              }}
              onLongPress={drag}
              trailing={
                <Pressable
                  hitSlop={8}
                  style={styles.removeButton}
                  onPress={() => {
                    void audioService.removeFromQueue(index).then(() => void reload());
                  }}
                >
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surface,
  },
  headerText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  removeButton: { paddingHorizontal: SPACING.s, paddingVertical: SPACING.s },
  removeText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.title },
});
