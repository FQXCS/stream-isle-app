/**
 * 库页配置页：服务器类型已在根设置页选择，这里只展示该 flavor 的
 * Tab 分类 / 排序项入口。
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { ServerFlavor } from '@/adapter/model';
import { SettingRow } from '@/component/SettingRow';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { CARD_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';

type SettingsNavigation = NativeStackNavigationProp<RootStackParamList>;

export function LibraryDisplaySettingsScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<SettingsNavigation>();
  const route = useRoute<{ key: string; name: string; params: { flavor: ServerFlavor } }>();
  const { flavor } = route.params;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <SettingRow
            label="Tab 分类"
            description="库页顶部展示哪些分类（每种最多 5 个，可拖动排序）"
            showArrow
            onPress={() => navigation.navigate(ROUTES.LIBRARY_TAB_SETTINGS, { flavor })}
          />
          <SettingRow
            label="排序项"
            description="按库类型和 Tab 配置排序字段（可拖动排序）"
            showArrow
            onPress={() => navigation.navigate(ROUTES.LIBRARY_SORT_SETTINGS, { flavor })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: SPACING.l, gap: SPACING.s },
    card: {
      backgroundColor: t.surface,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.l,
    },
  });
