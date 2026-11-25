/**
 * TV 海报卡（TV-m1 §4.4）：expo-image 加载 item.posterImageUrl（已含认证与 400 宽参数，
 * 不手拼 URL）；wide=继续观看 16:9 断点卡（播放钮 + 进度条 + 时间文本），
 * poster=按条目类型图幅（2:3 海报 / 16:9 单集 / 1:1 专辑，cardAspectRatioOf 共享口径）。
 * 焦点视觉经 TvPressable card 态收口（scale 1.06 + accent 描边 + 辉光）。
 * TV-m2 收口：onPress 由调用方下发（首页海报进详情，TV-m1-S4 no-op 切片移除）；
 * 新增 frame（网格统一帧，TV-m2 海报墙等宽单元）与 dimmed（收藏 Tab 取消收藏淡化）。
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { formatClock } from '@/util/format';
import { cardAspectRatioOf, mediaIconOf } from '@/util/mediaCard';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

/** 卡片图幅高度（10-foot 尺度；手机 MEDIA_CARD_HEIGHT=130 的 TV 档） */
export const TV_CARD_IMAGE_HEIGHT = 200;

/** 卡片形态 */
export type TvCardVariant = 'wide' | 'poster';

/** 网格统一帧（TV-m2 §4.1 海报墙等宽单元：宽度随列数实测，高度沿用卡档） */
export interface TvCardFrame {
  width: number;
  height: number;
}

interface TvPosterCardProps {
  item: MediaLibraryItem;
  variant?: TvCardVariant;
  /** 首屏第一卡持焦点（TV-m1 验收 #6） */
  hasTVPreferredFocus?: boolean;
  /** LEFT 显式焦点目标（行首卡指向跳板 tag，TV-m1 边缘逃逸机制） */
  nextFocusLeft?: number;
  /** 网格统一帧（传入时忽略 variant 图幅，等宽等高保证网格单元对齐） */
  frame?: TvCardFrame;
  /** 收藏筛选 Tab 下未收藏条目淡化置灰（WallGridCell 同口径） */
  dimmed?: boolean;
  /** Enter 动作（tv-m1 为 no-op 切片，TV-m2 由调用方下发路由） */
  onPress?: () => void;
}

/** 进度百分比：优先服务端 playedPercentage，缺省按位置/时长计算（ResumeRow 同口径） */
function progressPercentOf(item: MediaLibraryItem): number | undefined {
  const percent = item.userData.playedPercentage;
  if (percent !== undefined) {
    return percent;
  }
  if (item.userData.playbackPositionMs > 0 && item.runtimeMs !== undefined && item.runtimeMs > 0) {
    return (item.userData.playbackPositionMs / item.runtimeMs) * 100;
  }
  return undefined;
}

/** 时间文本：「07:11 / 27:55」；无总时长时只显示播放位置（ResumeRow 同口径） */
function timeTextOf(item: MediaLibraryItem): string | undefined {
  if (item.userData.playbackPositionMs <= 0) {
    return undefined;
  }
  const position = formatClock(item.userData.playbackPositionMs);
  return item.runtimeMs !== undefined && item.runtimeMs > 0
    ? `${position} / ${formatClock(item.runtimeMs)}`
    : position;
}

export function TvPosterCard({
  item,
  variant = 'poster',
  hasTVPreferredFocus = false,
  nextFocusLeft,
  frame,
  dimmed = false,
  onPress,
}: TvPosterCardProps) {
  const t = useTvTheme();
  const aspectRatio =
    frame !== undefined
      ? frame.width / frame.height
      : variant === 'wide'
        ? 16 / 9
        : cardAspectRatioOf(item.type);
  const width = frame !== undefined ? frame.width : Math.round(TV_CARD_IMAGE_HEIGHT * aspectRatio);
  const imageHeight = frame !== undefined ? frame.height : TV_CARD_IMAGE_HEIGHT;
  const percent = variant === 'wide' ? progressPercentOf(item) : undefined;
  const timeText = variant === 'wide' ? timeTextOf(item) : undefined;
  return (
    <TvPressable
      focusKind="card"
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={onPress}
      style={[styles.card, { width }, dimmed && styles.dimmed]}
      nextFocusLeft={nextFocusLeft}
    >
      <View style={[styles.thumb, { backgroundColor: t.surfaceSunken, height: imageHeight }]}>
        {item.posterImageUrl !== undefined ? (
          <Image
            source={{ uri: item.posterImageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            recyclingKey={item.id}
          />
        ) : (
          <View style={styles.fallback}>
            {/* 无封面：按条目类型显示图标（共享 mediaIconOf 映射） */}
            <AppIcon name={mediaIconOf(item.type)} size={40} color={t.textTertiary} />
          </View>
        )}
        {variant === 'wide' && (
          <View style={styles.playOverlay} pointerEvents="none">
            <View style={styles.playBadge}>
              <AppIcon name="play" size={26} color="#FFFFFF" />
            </View>
          </View>
        )}
        {percent !== undefined && percent > 0 && (
          <View style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${Math.min(percent, 100)}%` }]} />
          </View>
        )}
        {timeText !== undefined && (
          <Text style={styles.timeText} pointerEvents="none">
            {timeText}
          </Text>
        )}
      </View>
      <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
        {item.name}
      </Text>
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  /** 收藏 Tab 取消收藏淡化（不透明度置灰，不立即移除——服务端分页索引防跳） */
  dimmed: { opacity: 0.45 },
  thumb: {
    width: '100%',
    height: TV_CARD_IMAGE_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  progressTrack: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' },
  timeText: {
    position: 'absolute',
    right: 12,
    bottom: 20,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  name: { fontSize: 16, fontWeight: '600' },
});
