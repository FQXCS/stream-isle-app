/**
 * 演员横滑行（M2 文档 §4.11）：peopleList 前 CAST_ROW_LIMIT 个，点击进人物页。
 */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { PersonRef } from '@/adapter/model';
import { PersonCard } from '@/component/PersonCard';
import { CAST_ROW_LIMIT } from '@/constant/playback';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';

interface CastRowProps {
  peopleList: PersonRef[];
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CastRow({ peopleList }: CastRowProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<NavigationProp>();
  if (peopleList.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr('item.cast')}</Text>
      <FlatList
        horizontal
        data={peopleList.slice(0, CAST_ROW_LIMIT)}
        keyExtractor={(person) => person.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate(ROUTES.PERSON, { personId: item.id })}>
            <PersonCard person={item} />
          </Pressable>
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
});
