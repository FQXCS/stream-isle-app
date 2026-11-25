/**
 * TV「我的媒体」库卡片（TV-m1 §4.4）：16:9 库图 + 库名；无库图回退库类型图标（TV 侧映射表）。
 * TV-m2 收口：onPress 由调用方下发（进库浏览 TvLibrary，TV-m1-S4 no-op 切片移除）。
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaLibrary } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TV_LIBRARY_ICON_MAP } from '@tv/util/libraryIcon';
import { TV_CARD_IMAGE_HEIGHT } from '@tv/page/home/TvPosterCard';

/** 库卡片宽：与继续观看 16:9 大卡同宽（行高观感一致） */
const TILE_WIDTH = Math.round((TV_CARD_IMAGE_HEIGHT * 16) / 9);

interface TvLibraryTileProps {
  library: MediaLibrary;
  /** 首屏第一卡持焦点（TV-m1 验收 #6；首页无三区数据时首焦点落本行） */
  hasTVPreferredFocus?: boolean;
  /** LEFT 显式焦点目标（行首卡指向跳板 tag，TV-m1 边缘逃逸机制） */
  nextFocusLeft?: number;
  /** Enter 落地（TV-m2 收口：进库浏览 TvLibrary） */
  onPress?: () => void;
}

export function TvLibraryTile({
  library,
  hasTVPreferredFocus = false,
  nextFocusLeft,
  onPress,
}: TvLibraryTileProps) {
  const t = useTvTheme();
  return (
    <TvPressable
      focusKind="card"
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={library.name}
      onPress={onPress}
      style={[styles.card, { width: TILE_WIDTH }]}
      nextFocusLeft={nextFocusLeft}
    >
      <View style={[styles.thumb, { backgroundColor: t.surfaceSunken }]}>
        {library.primaryImageUrl !== undefined ? (
          <Image
            source={{ uri: library.primaryImageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            recyclingKey={library.id}
          />
        ) : (
          <View style={styles.fallback}>
            <AppIcon name={TV_LIBRARY_ICON_MAP[library.type]} size={44} color={t.textTertiary} />
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
        {library.name}
      </Text>
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  thumb: {
    width: '100%',
    height: Math.round((TV_CARD_IMAGE_HEIGHT * 9) / 16),
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
});
