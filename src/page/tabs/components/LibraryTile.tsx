/**
 * 「我的媒体」库卡片（首页/媒体库融合页，参考截图样式）：
 * 16:9 库图 + 库名，横向滑动；无库图时回退库类型图标（复用 LibraryCard 的映射）。
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibrary } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { LIBRARY_ICON_MAP } from '@/component/LibraryCard';
import { useTheme } from '@/component/useTheme';
import { MEDIA_WIDE_CARD_WIDTH } from '@/constant/browse';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';

/** 卡片宽度：与「继续观看」大卡同宽（16:9，高度 MEDIA_CARD_HEIGHT），两行尺寸一致 */
const TILE_WIDTH = MEDIA_WIDE_CARD_WIDTH;

interface LibraryTileProps {
  library: MediaLibrary;
  onPress: (library: MediaLibrary) => void;
}

export function LibraryTile({ library, onPress }: LibraryTileProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开库 ${library.name}`}
      onPress={() => onPress(library)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.thumb}>
        {library.primaryImageUrl !== undefined ? (
          <Image
            source={{ uri: library.primaryImageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            recyclingKey={library.id}
          />
        ) : (
          <AppIcon name={LIBRARY_ICON_MAP[library.type]} size={30} color={t.textSecondary} />
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {library.name}
      </Text>
    </Pressable>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: { width: TILE_WIDTH, gap: SPACING.xs },
    pressed: { opacity: 0.7 },
    thumb: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: POSTER_RADIUS,
      overflow: 'hidden',
      backgroundColor: t.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: { width: '100%', height: '100%' },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600' },
  });
