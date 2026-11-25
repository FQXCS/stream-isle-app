/**
 * TV 集列表（TV-m2 §4.3）：手机 EpisodeList props 契约的 TV 自绘版（禁入 @/page）——
 * 缩略图（Primary@400 已在 posterImageUrl 内）+「第 N 集 名称」+ 单行简介 + 时长 +
 * 已看勾标识 + 底部细进度条 + 行尾扩展位。TV 行内不放二级可点件（已看 toggle 由详情页
 * 已看按钮承担，集级 toggle 随 m3 播放页/菜单再开）；整行焦点（row 态不缩放防抖动），
 * Enter → 播放按钮同款 resolve 冒烟（TV-m2-S2，m3 接真播放）。
 */
import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { EpisodeItem } from '@/adapter/model';
import { useT } from '@/i18n';
import { formatClock } from '@/util/format';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

interface TvEpisodeRowProps {
  episodeList: EpisodeItem[];
  /** 点集回调（页面统一走 resolve 冒烟流程） */
  onSelectEpisode: (episode: EpisodeItem) => void;
  /** 行尾扩展位（M6 下载徽标位契约；TV 无下载引擎，m2 恒不传） */
  renderTrailing?: (episode: EpisodeItem) => ReactNode;
}

/** 集缩略图宽（10-foot 尺度；手机 140dp 的 TV 档，16:9） */
const TV_EPISODE_THUMB_WIDTH = 300;

export function TvEpisodeRow({ episodeList, onSelectEpisode, renderTrailing }: TvEpisodeRowProps) {
  const t = useTvTheme();
  const tr = useT();
  return (
    <View style={styles.container}>
      {episodeList.map((episode) => {
        const percent =
          !episode.userData.played &&
          episode.userData.playedPercentage !== undefined &&
          episode.userData.playedPercentage > 0
            ? episode.userData.playedPercentage
            : null;
        return (
          <TvPressable
            key={episode.id}
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={tr('item.episodeLabel', {
              number: episode.indexNumber,
              name: episode.name,
            })}
            onPress={() => onSelectEpisode(episode)}
            style={styles.row}
          >
            <View style={[styles.thumbBox, { backgroundColor: t.surfaceSunken }]}>
              {episode.posterImageUrl !== undefined ? (
                <Image
                  source={{ uri: episode.posterImageUrl }}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={200}
                  recyclingKey={episode.id}
                />
              ) : null}
              {/* 已看勾标识（未看空心 / 已看实心，色随主题 token） */}
              {episode.userData.played && (
                <View style={[styles.watchedDot, { backgroundColor: t.accent, borderColor: t.accent }]} />
              )}
              {/* 底部细进度条（playbackPositionMs/runtimeMs 口径与手机同） */}
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
                {tr('item.episodeLabel', { number: episode.indexNumber, name: episode.name })}
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
            {/* 行尾扩展位（固定窄宽避免标题抖动，契约同手机） */}
            {renderTrailing !== undefined && (
              <View style={styles.trailing}>{renderTrailing(episode)}</View>
            )}
          </TvPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  row: { flexDirection: 'row', gap: 18, alignItems: 'center', borderRadius: 14, padding: 8 },
  thumbBox: {
    width: TV_EPISODE_THUMB_WIDTH,
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  watchedDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 14,
    height: 14,
    borderRadius: 7,
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
  info: { flex: 1, gap: 4 },
  title: { fontSize: 19, fontWeight: '600' },
  overview: { fontSize: 16 },
  duration: { fontSize: 16 },
  trailing: { width: 64, alignItems: 'flex-end' },
});
