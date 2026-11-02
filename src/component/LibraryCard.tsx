/**
 * 库卡片（M1 文档 §4.9 Tab.Libraries）：库图（服务器 Primary 图，如照片库的拼图海报）+ 名称 + itemCount；
 * 服务器无图（如 asmr 音乐库）时回退按 LibraryTypeEnum 映射的类型图标。
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, MediaLibrary } from '@/adapter/model';
import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** 库类型 → 图标（服务器无库图时的占位） */
const LIBRARY_ICON_MAP: Record<LibraryTypeEnum, AppIconName> = {
  MOVIE: 'movie',
  TVSHOW: 'tv',
  MUSIC: 'audio',
  AUDIOBOOK: 'audiobook',
  MUSICVIDEO: 'musicVideo',
  PHOTO: 'photo',
  BOOK: 'book',
  BOXSET: 'boxset',
  PLAYLIST: 'playlist',
  GAME: 'game',
  LIVETV: 'liveTv',
  CHANNEL: 'channel',
  TRAILER: 'trailer',
  MIXED: 'mixed',
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
      {library.primaryImageUrl !== undefined ? (
        <Image
          source={{ uri: library.primaryImageUrl }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
          recyclingKey={library.id}
        />
      ) : (
        <View style={styles.iconBox}>
          <AppIcon name={LIBRARY_ICON_MAP[library.type]} size={28} color={t.textSecondary} />
        </View>
      )}
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
  iconBox: { width: 84, height: 48, alignItems: 'center', justifyContent: 'center' },
  // 库图多为 16:9（如照片库 640×360 拼图海报），用横向缩略图避免过度裁切
  thumb: { width: 84, height: 48, borderRadius: 8, backgroundColor: t.bg },
  meta: { flex: 1, gap: 2 },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  count: { color: t.textSecondary, fontSize: FONT_SIZE.body },
});
