/**
 * 集列表（M2 文档 §4.11 + 04 §4.4 收口；M6 增量集行下载徽标位，06 文档 §4.4.5）：
 * 单季集数量级有限，普通 View 渲染。
 * 卡片：缩略图（Primary@400）+「第 N 集 名称」+ 单行简介 + 时长 + 已看勾（可点击 toggle）+
 * 底部细进度条 + 行尾扩展位（M6 下载徽标）。点集 = 点播放（断点取该集自己的 userData，02 §4.11）；
 * 点已看勾 = 标记已看/未看 toggle（乐观更新由页面处理，04 §4.4）。
 */
import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EpisodeItem } from '@/adapter/model';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { formatClock } from '@/util/format';

interface EpisodeListProps {
  episodeList: EpisodeItem[];
  /** 点集回调（页面统一走点播放流程） */
  onSelectEpisode: (episode: EpisodeItem) => void;
  /** 已看勾 toggle 回调（04 §4.4 新增；乐观更新/回滚在页面） */
  onTogglePlayed?: (episode: EpisodeItem) => void;
  /** M6：行尾扩展位（集级下载徽标；06 文档 §4.4.5） */
  renderTrailing?: (episode: EpisodeItem) => ReactNode;
}

export function EpisodeList({ episodeList, onSelectEpisode, onTogglePlayed, renderTrailing }: EpisodeListProps) {
  return (
    <View style={styles.container}>
      {episodeList.map((episode) => (
        <EpisodeCard
          key={episode.id}
          episode={episode}
          onPress={() => onSelectEpisode(episode)}
          onTogglePlayed={onTogglePlayed}
          trailing={renderTrailing?.(episode)}
        />
      ))}
    </View>
  );
}

function EpisodeCard({
  episode,
  onPress,
  onTogglePlayed,
  trailing,
}: {
  episode: EpisodeItem;
  onPress: () => void;
  onTogglePlayed?: (episode: EpisodeItem) => void;
  trailing?: ReactNode;
}) {
  const t = useTheme();
  const percent =
    !episode.userData.played &&
    episode.userData.playedPercentage !== undefined &&
    episode.userData.playedPercentage > 0
      ? episode.userData.playedPercentage
      : null;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.thumbBox, { backgroundColor: t.surface }]}>
        {episode.posterImageUrl !== undefined ? (
          <Image
            source={{ uri: episode.posterImageUrl }}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
            recyclingKey={episode.id}
          />
        ) : (
          <View style={[styles.thumb, { backgroundColor: t.surface }]} />
        )}
        {/* 已看勾（02 §4.11 显示；04 §4.4 升级为可点击 toggle） */}
        {onTogglePlayed !== undefined ? (
          <Pressable
            style={[styles.watchedBadge, styles.watchedBadgePressable]}
            hitSlop={8}
            onPress={() => onTogglePlayed(episode)}
          >
            <View
              style={[
                styles.watchedDot,
                { borderColor: t.accent },
                episode.userData.played && { backgroundColor: t.accent },
              ]}
            />
          </Pressable>
        ) : episode.userData.played ? (
          <View style={[styles.watchedBadge, styles.watchedBadgePressable]}>
            <View
              style={[styles.watchedDot, { borderColor: t.accent, backgroundColor: t.accent }]}
            />
          </View>
        ) : null}
        {/* 底部细进度条（playbackPositionMs/runtimeMs） */}
        {percent !== null && (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${percent}%`, backgroundColor: t.accent }]}
            />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: t.textPrimary }]} numberOfLines={1}>
          第 {episode.indexNumber} 集 {episode.name}
        </Text>
        {episode.overview !== undefined && (
          <Text style={[styles.overview, { color: t.textSecondary }]} numberOfLines={1}>
            {episode.overview}
          </Text>
        )}
        {episode.runtimeMs !== undefined && (
          <Text style={[styles.duration, { color: t.textSecondary }]}>
            {formatClock(episode.runtimeMs)}
          </Text>
        )}
      </View>
      {/* M6：集行下载徽标（右侧图标态，06 §4.4.5） */}
      {trailing !== undefined && <View style={styles.trailing}>{trailing}</View>}
    </Pressable>
  );
}

const THUMB_WIDTH = 140;

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.l, gap: SPACING.m },
  card: { flexDirection: 'row', gap: SPACING.m, alignItems: 'center' },
  thumbBox: {
    width: THUMB_WIDTH,
    aspectRatio: 16 / 9,
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  watchedBadge: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 勾的点击热区（04 §4.4 toggle） */
  watchedBadgePressable: { backgroundColor: 'rgba(0,0,0,0.35)' },
  /** 勾本体：未看空心、已看实心（色随主题 token） */
  watchedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: { height: '100%' },
  info: { flex: 1, gap: 2 },
  title: { fontSize: FONT_SIZE.body },
  overview: { fontSize: FONT_SIZE.body },
  duration: { fontSize: FONT_SIZE.body },
  /** 行尾扩展位（下载徽标列，固定窄宽避免标题抖动） */
  trailing: { width: 64, alignItems: 'flex-end' },
});
