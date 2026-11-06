/**
 * 某库类型的排序 Tab 列表：选择 Tab 进入独立排序编辑器（原生 push 动画 + 动态标题）。
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, ServerFlavor } from '@/adapter/model';
import { SettingRow } from '@/component/SettingRow';
import { useTheme } from '@/component/useTheme';
import { tabsOfFlavor } from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, CARD_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import {
  primarySortTabOf,
  resolveTabSortOptions,
  usesPrimarySortConfig,
} from '@/util/libraryConfig';

type SettingsNavigation = NativeStackNavigationProp<RootStackParamList>;

interface LibrarySortTabsParams {
  flavor: ServerFlavor;
  libraryType: LibraryTypeEnum;
}

export function LibrarySortTabsScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<SettingsNavigation>();
  const route = useRoute<{ key: string; name: string; params: LibrarySortTabsParams }>();
  const { flavor, libraryType } = route.params;
  const sortListByTabScope = useLibraryDisplayStore((state) => state.sortListByTabScope);
  const tabList = tabsOfFlavor(libraryType, flavor);
  const primaryTab = primarySortTabOf(flavor, libraryType);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Tab</Text>
        <View style={styles.card}>
          {tabList.map((tab) => {
            // 文件夹与收藏/已看/未看跟随本库主内容 Tab，不再单独配置
            if (usesPrimarySortConfig(tab)) {
              return (
                <SettingRow
                  key={tab.id}
                  label={tab.label}
                  value={
                    primaryTab === undefined ? '不支持排序' : `跟随「${primaryTab.label}」`
                  }
                />
              );
            }
            if (tab.sortSet === 'none') {
              return <SettingRow key={tab.id} label={tab.label} value="不支持排序" />;
            }
            const count = resolveTabSortOptions({
              flavor,
              libraryType,
              tab,
              sortOverrides: sortListByTabScope,
            }).length;
            return (
              <SettingRow
                key={tab.id}
                label={tab.label}
                value={`已选 ${count} 项`}
                showArrow
                onPress={() =>
                  navigation.navigate(ROUTES.LIBRARY_SORT_EDITOR, {
                    flavor,
                    libraryType,
                    tabId: tab.id,
                  })
                }
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: SPACING.l, gap: SPACING.s },
    sectionTitle: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body - 1,
      paddingHorizontal: SPACING.s,
      marginTop: SPACING.s,
      marginBottom: SPACING.xs,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.l,
    },
  });
