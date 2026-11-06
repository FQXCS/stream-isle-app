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
import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useTransitionStore } from '@/store/transitionStore';
import { mediaIconOf } from '@/util/mediaCard';

interface PosterCardProps {
  item: MediaLibraryItem;
  /** 淡化置灰（收藏筛选下已取消收藏的卡片，04 §4.4） */
  dimmed?: boolean;
  /** 收藏 toggle 回调（传入时渲染收藏角标按钮；仅收藏筛选下传，04 §4.4） */
  onToggleFavorite?: (item: MediaLibraryItem) => void;
  /** 副标题覆盖（图书卡片惰性采集到文件大小后替换年份副标题） */
  subtextOverride?: string;
  /** 图幅宽高比（缺省 2:3 海报；融合页每库行按条目类型传入 16:9 / 1:1） */
  aspectRatio?: number;
}

export function PosterCard({
  item,
  dimmed = false,
  onToggleFavorite,
  subtextOverride,
  aspectRatio = 2 / 3,
}: PosterCardProps) {
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
      <View
        ref={posterBoxRef}
        style={[styles.posterBox, { backgroundColor: t.surfaceSunken, aspectRatio }]}
      >
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
            {/* 无封面：按条目类型显示图标（电影/剧集/音乐/照片…各用各的语义图标） */}
            <AppIcon name={mediaIconOf(item.type)} size={30} color={t.textTertiary} />
          </View>
        )}
        {item.userData.played && (
          <View style={styles.watchedBadge}>
            <AppIcon name="check" size={12} color="#FFFFFF" />
          </View>
        )}
        {/* 收藏角标按钮（04 §4.4：仅收藏筛选下渲染，点击就地取消收藏/恢复） */}
        {onToggleFavorite !== undefined && (
          <Pressable
            style={styles.favoriteBadge}
            hitSlop={8}
            onPress={() => onToggleFavorite(item)}
            accessibilityRole="button"
            accessibilityLabel={item.userData.favorite ? '取消收藏' : '收藏'}
          >
            <AppIcon
              name={item.userData.favorite ? 'heart' : 'heartOutline'}
              size={14}
              color={item.userData.favorite ? t.danger : t.textSecondary}
            />
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
      <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
        {item.name}
      </Text>
      {(subtextOverride ?? item.subtext) !== undefined && (
        <Text style={[styles.subtext, { color: t.textSecondary }]}>
          {subtextOverride ?? item.subtext}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 6 },
  posterBox: {
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  poster: { width: '100%', height: '100%' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  /** 已看角标（深色圆底 + 白色对勾，与参考稿一致） */
  watchedBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  /** 取消收藏淡化置灰（不移除卡片，避免服务端分页索引跳动，04 §4.4） */
  dimmed: { opacity: 0.4 },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressFill: { height: '100%', borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  progressIndeterminate: { width: '30%', opacity: 0.7 },
  name: { fontSize: FONT_SIZE.body - 1, fontWeight: '600' },
  subtext: { fontSize: FONT_SIZE.caption },
});
