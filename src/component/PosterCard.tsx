/**
 * 海报卡（M1 文档 §4.10 海报墙 + 04 §4.4 收藏联动 + M6 §4.6.2 转场起点）：
 * expo-image 渐显占位 + name + subtext + 已看角标 + playbackPositionMs>0 时底部细进度条。
 * M4 增量：dimmed 淡化态（收藏筛选下取消收藏置灰不移除）、可选收藏角标按钮。
 * M6 增量（06 文档 §4.6.2）：按下时 measureInWindow 测量海报屏幕矩形 → transitionStore.begin，
 * 供根级 SharedPosterOverlay 飞行；快速连点时 begin 覆盖（同 uri 重挂载重启飞行）；无海报不触发。
 */
import { useRef, type ComponentRef } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useTransitionStore } from '@/store/transitionStore';

interface PosterCardProps {
  item: MediaLibraryItem;
  /** 淡化置灰（收藏筛选下已取消收藏的卡片，04 §4.4） */
  dimmed?: boolean;
  /** 收藏 toggle 回调（传入时渲染收藏角标按钮；仅收藏筛选下传，04 §4.4） */
  onToggleFavorite?: (item: MediaLibraryItem) => void;
}

export function PosterCard({ item, dimmed = false, onToggleFavorite }: PosterCardProps) {
  const t = useTheme();
  const posterBoxRef = useRef<ComponentRef<typeof View> | null>(null);
  const begin = useTransitionStore((state) => state.begin);
  const progressPercent =
    item.userData.playedPercentage !== undefined
      ? item.userData.playedPercentage
      : // 无 playedPercentage（无 runtimeMs）时若有播放位置，仅显示有进度不显示比例
        undefined;
  return (
    <View
      style={[styles.card, dimmed && styles.dimmed]}
      onTouchEnd={() => {
        // M6 转场起点（06 §4.6.2）：按下即测量上报；测量失败静默（无浮层 = 普通转场）
        if (item.posterImageUrl === undefined) {
          return;
        }
        posterBoxRef.current?.measureInWindow((x, y, width, height) => {
          begin({ uri: item.posterImageUrl as string, fromRect: { x, y, width, height } });
        });
      }}
    >
      <View ref={posterBoxRef} style={[styles.posterBox, { backgroundColor: t.surface }]}>
        {item.posterImageUrl !== undefined ? (
          <Image
            source={{ uri: item.posterImageUrl }}
            style={styles.poster}
            contentFit="cover"
            // expo-image 渐显（§4.10）；磁盘缓存由 expo-image 默认策略兜底（验收标准 9）
            transition={200}
            recyclingKey={item.id}
          />
        ) : (
          <View style={[styles.poster, styles.posterFallback]}>
            <Text style={[styles.fallbackText, { color: t.textSecondary }]}>无海报</Text>
          </View>
        )}
        {item.userData.played && <View style={[styles.watchedBadge, { backgroundColor: t.accent }]} />}
        {/* 收藏角标按钮（04 §4.4：仅收藏筛选下渲染，点击就地取消收藏/恢复） */}
        {onToggleFavorite !== undefined && (
          <Pressable
            style={styles.favoriteBadge}
            hitSlop={8}
            onPress={() => onToggleFavorite(item)}
          >
            <Text style={[styles.favoriteIcon, { color: t.accent }]}>{item.userData.favorite ? '♥' : '♡'}</Text>
          </Pressable>
        )}
        {progressPercent !== undefined && progressPercent > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: t.accent }]} />
          </View>
        )}
        {progressPercent === undefined && item.userData.playbackPositionMs > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, styles.progressIndeterminate, { backgroundColor: t.accent }]} />
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={2}>
        {item.name}
      </Text>
      {item.subtext !== undefined && (
        <Text style={[styles.subtext, { color: t.textSecondary }]}>{item.subtext}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 4 },
  posterBox: {
    aspectRatio: 2 / 3,
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  poster: { width: '100%', height: '100%' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontSize: FONT_SIZE.body },
  watchedBadge: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  /** 收藏角标按钮（04 §4.4，左上角，不与已看角标重叠） */
  favoriteBadge: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  favoriteIcon: { fontSize: 14, lineHeight: 16 },
  /** 取消收藏淡化置灰（不移除卡片，避免服务端分页索引跳动，04 §4.4） */
  dimmed: { opacity: 0.4 },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: { height: '100%' },
  progressIndeterminate: { width: '30%', opacity: 0.7 },
  name: { fontSize: FONT_SIZE.body },
  subtext: { fontSize: FONT_SIZE.body },
});
