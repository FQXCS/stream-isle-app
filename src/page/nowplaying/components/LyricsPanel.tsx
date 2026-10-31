/**
 * 歌词面板（M6 文档 §4.6.3；设计文档 §7.5 歌词 P1）：NowPlaying 封面/歌词双态的歌词态。
 * 三态：同步歌词（.lrc，逐行高亮 + 活动行滚动居中）/ 纯文本歌词（静态列表）/ 无歌词占位。
 * 同步判定 util/lyrics.activeLyricIndex；位置源复用 M5 track-player 进度流
 * （useProgress，刷新节流 LYRIC_SYNC_INTERVAL_MS，不新建引擎）；歌词不进队列/通知栏。
 * 本组件属媒体沉浸页白名单（NowPlaying 大封面态），固定深色（constant/theme COLORS）。
 */
import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '@/adapter/model';
import { useProgress } from '@rntp/player';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { LYRIC_SYNC_INTERVAL_MS } from '@/constant/lyrics';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { audioService } from '@/service/AudioService';
import { activeLyricIndex } from '@/util/lyrics';

export function LyricsPanel({ itemId }: { itemId: string }) {
  /** 已加载完成的歌词（携带归属 itemId；与当前曲不符视为加载中） */
  const [loaded, setLoaded] = useState<{ id: string; lines: LyricLine[] | null } | null>(null);
  const listRef = useRef<FlatList<LyricLine>>(null);
  // 渲染期派生当前曲歌词：loaded.id ≠ itemId → 加载中（不进 effect 同步 setState）
  const lines = loaded?.id === itemId ? loaded.lines : undefined;

  // 切歌加载（audioService.loadLyrics 随当前曲目缓存，回同一曲命中缓存不重复请求）
  useEffect(() => {
    let cancelled = false;
    void audioService
      .loadLyrics(itemId)
      .then((result) => {
        if (!cancelled) {
          setLoaded({ id: itemId, lines: result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ id: itemId, lines: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  // 位置源复用 track-player 进度流（每 LYRIC_SYNC_INTERVAL_MS 刷新一次，06 §4.6.3）
  const progress = useProgress(LYRIC_SYNC_INTERVAL_MS / 1000);
  const isSynced = lines !== null && lines !== undefined && lines.some((line) => line.startMs !== undefined);
  const activeIndex = isSynced && lines !== undefined ? activeLyricIndex(lines, progress.position * 1000) : -1;

  // 活动行滚动居中（viewPosition=0.4 视觉居中偏上；越界由 onScrollToIndexFailed 兜底）
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current !== null) {
      listRef.current.scrollToIndex({ index: activeIndex, viewPosition: 0.4, animated: true });
    }
  }, [activeIndex]);

  if (lines === undefined) {
    // 加载中（loaded 未回填或切歌后新曲目尚未加载完成）
    return (
      <View style={styles.fill}>
        <Text style={styles.placeholder}>歌词加载中…</Text>
      </View>
    );
  }

  if (lines === null || lines.length === 0) {
    // 无歌词占位（A11 第三态）
    return (
      <View style={styles.fill}>
        <Text style={styles.placeholder}>暂无歌词</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={lines}
      keyExtractor={(_, index) => String(index)}
      renderItem={({ item, index }) => (
        <Text
          style={[styles.line, index === activeIndex && styles.lineActive]}
          numberOfLines={2}
        >
          {item.text}
        </Text>
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      // 活动行居中定位失败（未渲染区跳转）按偏移兜底，避免滚动中断崩溃
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: true,
        });
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: COLORS.textSecondary, fontSize: FONT_SIZE.title },
  listContent: { paddingVertical: 160, gap: SPACING.l },
  line: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.title,
    textAlign: 'center',
    lineHeight: 26,
  },
  lineActive: { color: COLORS.textPrimary, fontWeight: '700' },
});
