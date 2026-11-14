/**
 * 横向海报卡行（M4 文档 §4.3 新建，搜索结果分组与首页三区共用）：
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

/** 海报宽高比（未传 aspectRatioOf 时的缺省图幅） */
const POSTER_ASPECT_RATIO = 2 / 3;

interface PosterRowProps {
  itemList: MediaLibraryItem[];
  /** 点卡回调（缺省默认导航到详情页：搜索结果与首页均直达 Item） */
  onPressItem?: (item: MediaLibraryItem) => void;
  /** 卡片宽高比（缺省 2:3 海报；融合页每库行按条目类型传入 16:9 / 1:1） */
  aspectRatioOf?: (item: MediaLibraryItem) => number;
  /** 固定卡片高度：设置后宽度按图幅自适应（混排行高度一致），未设置时用固定宽度 */
  cardHeight?: number;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function PosterRow({ itemList, onPressItem, aspectRatioOf, cardHeight }: PosterRowProps) {
  const navigation = useNavigation<NavigationProp>();
  if (itemList.length === 0) {
    return null;
  }
  return (
    <FlatList
      horizontal
      data={itemList}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const aspectRatio = aspectRatioOf?.(item) ?? POSTER_ASPECT_RATIO;
        return (
          <Pressable
            onPress={() =>
              onPressItem !== undefined
                ? onPressItem(item)
                : navigation.navigate(ROUTES.ITEM, { itemId: item.id })
            }
          >
            <View
              style={
                cardHeight !== undefined ? { width: cardHeight * aspectRatio } : styles.cardBox
              }
            >
              <PosterCard item={item} aspectRatio={aspectRatio} />
            </View>
          </Pressable>
        );
      }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
    />
  );
}

const styles = StyleSheet.create({
  rowContent: { paddingHorizontal: SPACING.l, gap: SPACING.m },
  cardBox: { width: CARD_WIDTH },
});
