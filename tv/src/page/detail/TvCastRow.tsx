/**
 * TV 演员横滑行（TV-m2 §4.3）：手机 CastRow 内嵌 navigation 禁入，TV 版 props 改回调
 * onSelectPerson，路由映射收口在详情页。peopleList 前 CAST_ROW_LIMIT 个（共享常量）。
 */
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { PersonRef } from '@/adapter/model';
import { CAST_ROW_LIMIT } from '@/constant/playback';
import { useT } from '@/i18n';

import { TvPersonCard } from '@tv/component/TvPersonCard';
import { useTvTheme } from '@tv/component/useTvTheme';

interface TvCastRowProps {
  peopleList: PersonRef[];
  /** 人物卡 Enter 落地（详情页收口 Person 路由） */
  onSelectPerson(personId: string): void;
}

export function TvCastRow({ peopleList, onSelectPerson }: TvCastRowProps) {
  const t = useTvTheme();
  const tr = useT();
  if (peopleList.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>{tr('item.cast')}</Text>
      <FlatList
        horizontal
        data={peopleList.slice(0, CAST_ROW_LIMIT)}
        keyExtractor={(person) => person.id}
        renderItem={({ item }) => (
          <TvPersonCard
            person={{ id: item.id, name: item.name, imageUrl: item.headImageUrl }}
            onSelect={() => onSelectPerson(item.id)}
          />
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
