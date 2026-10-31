/**
 * 横向海报卡行（04 文档 §4.3 新建，搜索结果分组与首页三区共用）：
 * FlatList 横滑，卡片宽度固定；空列表不渲染（分区级空 → 隐藏分区）。
 */
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MediaLibraryItem } from '@/adapter/model';
import { PosterCard } from '@/component/PosterCard';
import { SPACING } from '@/constant/theme';
import { ROUTES } from '@/constant/navigation';
import type { RootStackParamList } from '@/page/navigation/types';

/** 横向卡片宽度（PosterCard 以 flex:1 适配父容器，与 SimilarRow 同宽） */
const CARD_WIDTH = 110;

interface PosterRowProps {
  itemList: MediaLibraryItem[];
  /** 点卡回调（缺省默认导航到详情页：搜索结果与首页均直达 Item） */
  onPressItem?: (item: MediaLibraryItem) => void;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function PosterRow({ itemList, onPressItem }: PosterRowProps) {
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
          onPress={() =>
            onPressItem !== undefined
              ? onPressItem(item)
              : navigation.navigate(ROUTES.ITEM, { itemId: item.id })
          }
        >
          <View style={styles.cardBox}>
            <PosterCard item={item} />
          </View>
        </Pressable>
      )}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
    />
  );
}

const styles = StyleSheet.create({
  rowContent: { paddingHorizontal: SPACING.l, gap: SPACING.m },
  cardBox: { width: CARD_WIDTH },
});
