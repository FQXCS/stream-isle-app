/**
 * 艺术家区列表（M5 文档 §4.12：圆形头像行列表，FlashList 单列分页）。
 */
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface ArtistListProps {
  items: MediaLibraryItem[];
  /** 点击进 AlbumDetail（artist 态） */
  onPressItem: (item: MediaLibraryItem) => void;
  onEndReached: () => void;
  footer?: React.ReactElement | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function ArtistList({ items, onPressItem, onEndReached, footer, onRefresh, refreshing }: ArtistListProps) {
  const t = useTheme();
  const styles = createStyles(t);
  // 迷你条让位（05 §4.10）：音频活跃时底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable style={styles.row} onPress={() => onPressItem(item)}>
          {item.posterImageUrl !== undefined ? (
            <Image
              source={{ uri: item.posterImageUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              recyclingKey={item.id}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.fallbackText}>♪</Text>
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </Pressable>
      )}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={footer ?? null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  content: { paddingHorizontal: SPACING.m },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingVertical: SPACING.s,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.surface },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: t.textSecondary, fontSize: FONT_SIZE.title },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.body, flex: 1 },
});
