/**
 * 队列面板（05 文档 §4.10/§4.11）：NowPlaying 内近全屏上拉面板。
 * 头部：模式图标 + 「列表循环（N 首）」+ 清空/收起；行：曲名 + 「艺人 - 专辑」+ 当前曲均衡器 + 移除。
 * 队列真源在 track-player 原生侧，仅面板打开时 getQueueSnapshot 拉全量（不进 store）；
 * 拖动 → moveInQueue，删除 → removeFromQueue，点击行 → skipToIndex（UI 不直呼 TrackPlayer.*）。
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { type DragEndParams } from 'react-native-draggable-flatlist';
import { useFocusEffect } from '@react-navigation/native';

import { AppIcon } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { audioService, type AudioQueueEntry } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { PLAYBACK_MODE_META, combinedPlaybackMode } from '@/util/playbackMode';
import { QueueRow } from '@/page/nowplaying/components/QueueRow';

/** 行 key：同曲可能在队列出现多次，拼接快照序号避免 key 冲突（key 随行数据移动） */
type QueueEntry = AudioQueueEntry & { key: string };

interface QueuePanelProps {
  /** 清空队列完成（页面据此收起面板并退出 NowPlaying） */
  onCleared?: () => void;
}

export function QueuePanel({ onCleared }: QueuePanelProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const repeatMode = usePlayerStore((state) => state.audio.repeatMode);
  const shuffle = usePlayerStore((state) => state.audio.shuffle);
  const currentTrackId = usePlayerStore((state) => state.audio.currentTrack?.id ?? null);
  const queueLength = usePlayerStore((state) => state.audio.queueLength);
  const [entryList, setEntryList] = useState<QueueEntry[] | null>(null);

  const mode = combinedPlaybackMode(repeatMode, shuffle);
  const modeMeta = PLAYBACK_MODE_META[mode];
  // 快照未就绪时先用 store 镜像长度，避免标题闪 0
  const shownCount = entryList?.length ?? queueLength;

  const reload = useCallback(async () => {
    const snapshot = await audioService.getQueueSnapshot();
    setEntryList(snapshot.map((entry, index) => ({ ...entry, key: `${index}:${entry.id}` })));
  }, []);

  // 面板挂载/聚焦时重拉全量队列（真源在 track-player 原生侧）
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const handleDragEnd = useCallback((params: DragEndParams<QueueEntry>) => {
    // 长按拖动 → moveInQueue（from → to 逐项映射，播放顺序即时跟随）
    const { from, to } = params;
    if (from === to) {
      return;
    }
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
  }, []);

  const handleRemove = useCallback(
    (index: number) => {
      void audioService.removeFromQueue(index).then(() => void reload());
    },
    [reload]
  );

  /** 点击模式标题循环切换（列表循环 → 随机 → 单曲循环），图标/文案由 store 订阅即时更新 */
  const handleCycleMode = useCallback(() => {
    void audioService.cyclePlaybackMode();
  }, []);

  /** 清空队列：二次确认 → stop() 停止播放并清空 → 页面退出 NowPlaying */
  const handleClear = useCallback(() => {
    Alert.alert('清空队列', '将停止播放并清空当前队列。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void audioService.stop().then(() => onCleared?.());
        },
      },
    ]);
  }, [onCleared]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          hitSlop={8}
          style={styles.modeInfo}
          onPress={handleCycleMode}
          accessibilityLabel={`播放模式：${modeMeta.label}，点击切换`}
        >
          <AppIcon name={modeMeta.icon} size={22} color={t.textPrimary} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {`${modeMeta.label}（${shownCount} 首）`}
          </Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={handleClear} accessibilityLabel="清空队列">
          <AppIcon name="broom" size={22} color={t.textPrimary} />
        </Pressable>
      </View>
      {entryList === null ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : entryList.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>队列为空</Text>
        </View>
      ) : (
        <DraggableFlatList
          data={entryList}
          keyExtractor={(item) => item.key}
          onDragEnd={handleDragEnd}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, drag, getIndex }) => {
            const index = getIndex() ?? 0;
            return (
              <QueueRow
                entry={item}
                active={item.id === currentTrackId}
                showSeparator={index < entryList.length - 1}
                onPress={() => {
                  void audioService.skipToIndex(index);
                }}
                onLongPress={drag}
                onRemove={() => handleRemove(index)}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.m,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.l,
      paddingBottom: SPACING.m,
    },
    modeInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, flexShrink: 1 },
    headerTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '600', flexShrink: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: t.textSecondary, fontSize: 14 },
    listContent: { paddingBottom: SPACING.xl },
  });
