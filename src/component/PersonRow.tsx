/**
 * 横向人物头像卡行（04 文档 §4.3 新建）：搜索结果人物组消费，圆形头像 + 姓名，
 * 点击进人物页（复用 M2 PersonCard 的视觉规格，数据源为搜索结果的 MediaLibraryItem）。
 */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MediaLibraryItem } from '@/adapter/model';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import type { RootStackParamList } from '@/page/navigation/types';

/** 头像直径（与 PersonCard 视觉规格一致） */
const HEAD_SIZE = 72;
/** 卡片宽度（头像 + 间距） */
const CARD_WIDTH = HEAD_SIZE + SPACING.l;

interface PersonRowProps {
  itemList: MediaLibraryItem[];
  /** 点卡回调（缺省默认导航到人物页） */
  onPressItem?: (item: MediaLibraryItem) => void;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function PersonRow({ itemList, onPressItem }: PersonRowProps) {
  const t = useTheme();
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
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() =>
            onPressItem !== undefined
              ? onPressItem(item)
              : navigation.navigate(ROUTES.PERSON, { personId: item.id })
          }
        >
          <View style={styles.headBox}>
            {item.posterImageUrl !== undefined ? (
              <Image
                source={{ uri: item.posterImageUrl }}
                style={styles.head}
                contentFit="cover"
                transition={200}
                recyclingKey={item.id}
              />
            ) : (
              <View style={[styles.head, styles.headFallback]}>
                {/* 无头像回退：姓名首字占位（与 PersonCard 一致） */}
                {(item.name || '?').slice(0, 1)}
              </View>
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </Pressable>
      )}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  rowContent: { paddingHorizontal: SPACING.l, gap: SPACING.m },
  card: { width: CARD_WIDTH, alignItems: 'center', gap: 2 },
  headBox: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: t.surface,
    marginBottom: SPACING.xs,
  },
  head: { width: '100%', height: '100%' },
  headFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    color: t.textSecondary,
    fontSize: FONT_SIZE.header,
  },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.body, maxWidth: CARD_WIDTH },
});
