/**
 * 相似推荐行（M2 文档 §4.11）：横向 PosterCard（M1 组件），点击回详情页。
 */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { MediaLibraryItem } from '@/adapter/model';
import { PosterCard } from '@/component/PosterCard';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';

interface SimilarRowProps {
  itemList: MediaLibraryItem[];
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 横向卡片宽度（PosterCard 以 flex:1 适配父容器） */
const CARD_WIDTH = 110;

export function SimilarRow({ itemList }: SimilarRowProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<NavigationProp>();
  if (itemList.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr('item.similar')}</Text>
      <FlatList
        horizontal
        data={itemList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cardBox}>
            <Pressable onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}>
              <PosterCard item={item} />
            </Pressable>
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  section: { marginTop: SPACING.l, gap: SPACING.m },
  sectionTitle: {
    color: t.textPrimary,
    fontSize: FONT_SIZE.title,
    paddingHorizontal: SPACING.l,
  },
  rowContent: { paddingHorizontal: SPACING.l, gap: SPACING.m },
  cardBox: { width: CARD_WIDTH },
});
