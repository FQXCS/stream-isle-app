/**
 * 继续观看横滑行（首页/媒体库融合页，参考截图样式）：
 * 16:9 大卡 + 居中播放圆钮 + 底部进度条 + 右下角「播放位置 / 总时长」+ 卡下标题；
 * 点击直达详情页（与 PosterRow 同口径）。分区级空由调用方隐藏，组件内空列表不渲染。
 */
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import { MEDIA_WIDE_CARD_WIDTH } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';
import { formatClock } from '@/util/format';
import { mediaIconOf } from '@/util/mediaCard';

/** 卡片宽度：与「我的媒体」库卡片同宽（16:9，高度 MEDIA_CARD_HEIGHT），两行尺寸一致 */
const CARD_WIDTH = MEDIA_WIDE_CARD_WIDTH;

interface ResumeRowProps {
  itemList: MediaLibraryItem[];
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 进度百分比：优先服务端 playedPercentage，缺省按位置/时长计算；均无则 undefined */
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

/** 时间文本：「07:11 / 27:55」；无总时长时只显示播放位置，无位置时不显示 */
function timeTextOf(item: MediaLibraryItem): string | undefined {
  if (item.userData.playbackPositionMs <= 0) {
    return undefined;
  }
  const position = formatClock(item.userData.playbackPositionMs);
  return item.runtimeMs !== undefined && item.runtimeMs > 0
    ? `${position} / ${formatClock(item.runtimeMs)}`
    : position;
}

export function ResumeRow({ itemList }: ResumeRowProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<NavigationProp>();

  if (itemList.length === 0) {
    return null;
  }

  return (
    <FlatList
      horizontal
      data={itemList}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
      renderItem={({ item }) => {
        const percent = progressPercentOf(item);
        const timeText = timeTextOf(item);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('server.continueWatchingOf', { name: item.name })}
            onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.thumb}>
              {item.posterImageUrl !== undefined ? (
                <Image
                  source={{ uri: item.posterImageUrl }}
                  style={styles.image}
                  contentFit="cover"
                  transition={200}
                  recyclingKey={item.id}
                />
              ) : (
                <View style={styles.fallback}>
                  {/* 无封面：按条目类型显示图标 */}
                  <AppIcon name={mediaIconOf(item.type)} size={36} color={t.textSecondary} />
                </View>
              )}
              {/* 居中播放圆钮（截图样式：半透明黑底 + 白色播放键） */}
              <View style={styles.playOverlay} pointerEvents="none">
                <View style={styles.playBadge}>
                  <AppIcon name="play" size={24} color="#FFFFFF" />
                </View>
              </View>
              {percent !== undefined && percent > 0 && (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(percent, 100)}%` }]} />
                </View>
              )}
              {timeText !== undefined && <Text style={styles.timeText}>{timeText}</Text>}
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    rowContent: { paddingHorizontal: SPACING.l, gap: SPACING.m },
    card: { width: CARD_WIDTH, gap: SPACING.xs },
    pressed: { opacity: 0.7 },
    thumb: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: POSTER_RADIUS,
      overflow: 'hidden',
      backgroundColor: t.surface,
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
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    progressTrack: {
      position: 'absolute',
      left: SPACING.m,
      right: SPACING.m,
      bottom: SPACING.m,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
    progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' },
    timeText: {
      position: 'absolute',
      right: SPACING.m,
      bottom: SPACING.m + SPACING.xs,
      color: '#FFFFFF',
      fontSize: FONT_SIZE.body - 2,
      fontWeight: '600',
    },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600' },
  });
