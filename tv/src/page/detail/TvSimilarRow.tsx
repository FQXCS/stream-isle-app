/**
 * TV 相似推荐横滑行（TV-m2 §4.3）：手机 SimilarRow 内嵌 navigation 禁入，TV 版 props 改
 * 回调 onSelectItem，路由映射收口在详情页。卡图幅随条目类型（poster variant）。
 */
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { useT } from '@/i18n';

import { useTvTheme } from '@tv/component/useTvTheme';
import { TvPosterCard } from '@tv/page/home/TvPosterCard';

interface TvSimilarRowProps {
  itemList: MediaLibraryItem[];
  /** 相似卡 Enter 落地（详情页收口 Item 路由，进详情后换目标条目） */
  onSelectItem(itemId: string): void;
}

export function TvSimilarRow({ itemList, onSelectItem }: TvSimilarRowProps) {
  const t = useTvTheme();
  const tr = useT();
  if (itemList.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>{tr('item.similar')}</Text>
      <FlatList
        horizontal
        data={itemList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TvPosterCard item={item} onPress={() => onSelectItem(item.id)} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16 },
  rowContent: { paddingHorizontal: 16, gap: 16 },
});
