/**
 * 库卡片（M1 文档 §4.9 Tab.Libraries）：图标按 LibraryTypeEnum 映射、名称、itemCount。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, MediaLibrary } from '@/adapter/model';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** 库类型 → 图标字形（M1 无图标库，字符占位；视觉打磨 P1） */
const LIBRARY_ICON_MAP: Record<LibraryTypeEnum, string> = {
  MOVIE: '🎬',
  TVSHOW: '📺',
  MUSIC: '🎵',
  PHOTO: '📷',
  BOOK: '📚',
  MIXED: '📁',
};

interface LibraryCardProps {
  library: MediaLibrary;
  onPress: (library: MediaLibrary) => void;
}

export function LibraryCard({ library, onPress }: LibraryCardProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(library)}
    >
      <Text style={styles.icon}>{LIBRARY_ICON_MAP[library.type]}</Text>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {library.name}
        </Text>
        {library.itemCount !== undefined && (
          <Text style={styles.count}>{library.itemCount} 项</Text>
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.m,
    gap: SPACING.m,
  },
  pressed: { opacity: 0.7 },
  icon: { fontSize: 28 },
  meta: { flex: 1, gap: 2 },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  count: { color: t.textSecondary, fontSize: FONT_SIZE.body },
});
