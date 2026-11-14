/**
 * 歌词面板（M5 文档 §4.10；设计文档 §7.5 歌词 P1）：NowPlaying 大封面下方的常驻歌词区。
 * 三态：同步歌词（.lrc，逐行高亮 + 活动行滚动居中）/ 纯文本歌词（静态列表）/ 无歌词占位。
 * 同步判定 util/lyrics.activeLyricIndex；位置源复用 M5 track-player 进度流
 * （useProgress，刷新节流 LYRIC_SYNC_INTERVAL_MS，不新建引擎）；歌词不进队列/通知栏。
 * 文字色由 NowPlaying 按页面 tone 传入：封面态沉浸白，无封面主题玻璃页取当前主题 token。
 */
import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '@/adapter/model';
import { useProgress } from '@rntp/player';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { LYRIC_SYNC_INTERVAL_MS } from '@/constant/lyrics';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { audioService } from '@/service/AudioService';
import { activeLyricIndex } from '@/util/lyrics';

/** 歌词行高（动态上下留白按它折算，保证首行/活动行落在视觉中心） */
const LYRIC_LINE_HEIGHT = 26;

interface LyricsPanelProps {
  itemId: string;
  /** 非活动行文字色（默认沉浸深色页） */
  textColor?: string;
  /** 活动行文字色（默认沉浸深色页） */
  activeTextColor?: string;
}

export function LyricsPanel({
  itemId,
  textColor = COLORS.textSecondary,
  activeTextColor = COLORS.textPrimary,
}: LyricsPanelProps) {
  /** 已加载完成的歌词（携带归属 itemId；与当前曲不符视为加载中） */
  const [loaded, setLoaded] = useState<{ id: string; lines: LyricLine[] | null } | null>(null);
  /** 歌词区实际高度（父布局 flex 分配，onLayout 回填后动态折算上下留白） */
  const [areaHeight, setAreaHeight] = useState(0);
  const tr = useT();
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

  // 位置源复用 track-player 进度流（每 LYRIC_SYNC_INTERVAL_MS 刷新一次，M6 §4.6.3）
  const progress = useProgress(LYRIC_SYNC_INTERVAL_MS / 1000);
  const isSynced = lines !== null && lines !== undefined && lines.some((line) => line.startMs !== undefined);
  const activeIndex = isSynced && lines !== undefined ? activeLyricIndex(lines, progress.position * 1000) : -1;

  // 活动行滚动居中（viewPosition=0.4 视觉居中偏上；越界由 onScrollToIndexFailed 兜底）
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current !== null) {
      listRef.current.scrollToIndex({ index: activeIndex, viewPosition: 0.4, animated: true });
    }
  }, [activeIndex]);

  // 常驻歌词区高度由父布局决定：上下留白取「(区高 - 行高) / 2」，不足一屏时退化为 SPACING.xl
  const verticalPadding =
    areaHeight > 0 ? Math.max(SPACING.xl, (areaHeight - LYRIC_LINE_HEIGHT) / 2) : SPACING.xl;

  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        setAreaHeight(event.nativeEvent.layout.height);
      }}
    >
      {lines === undefined ? (
        // 加载中（loaded 未回填或切歌后新曲目尚未加载完成）
        <View style={styles.centerFill}>
          <Text style={[styles.placeholder, { color: textColor }]}>{tr('nowPlaying.lyricsLoading')}</Text>
        </View>
      ) : lines === null || lines.length === 0 ? (
        // 无歌词占位（A11 第三态）
        <View style={styles.centerFill}>
          <Text style={[styles.placeholder, { color: textColor }]}>{tr('nowPlaying.noLyrics')}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={lines}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item, index }) => (
            <Text
              style={[
                styles.line,
                { color: textColor },
                index === activeIndex && [styles.lineActive, { color: activeTextColor }],
              ]}
              numberOfLines={2}
            >
              {item.text}
            </Text>
          )}
          contentContainerStyle={[styles.listContent, { paddingVertical: verticalPadding }]}
          showsVerticalScrollIndicator={false}
          // 活动行居中定位失败（未渲染区跳转）按偏移兜底，避免滚动中断崩溃
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  placeholder: { fontSize: FONT_SIZE.title },
  listContent: { gap: SPACING.l },
  line: {
    fontSize: FONT_SIZE.title,
    lineHeight: LYRIC_LINE_HEIGHT,
    textAlign: 'center',
  },
  lineActive: { fontWeight: '700' },
});
