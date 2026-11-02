/**
 * 排序项设置：指定服务器类型后展示库类型列表；
 * 选择库类型进入独立 Tab 列表页（原生 push 动画 + 动态标题）。
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, ServerFlavor, SortByEnum } from '@/adapter/model';
import { SettingRow } from '@/component/SettingRow';
import { useTheme } from '@/component/useTheme';
import {
  LIBRARY_TYPE_LABELS,
  libraryTypesOfFlavor,
  tabsOfFlavor,
} from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { usesPrimarySortConfig } from '@/util/libraryConfig';

type SettingsNavigation = NativeStackNavigationProp<RootStackParamList>;

export function LibrarySortSettingsScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<SettingsNavigation>();
  const route = useRoute<{ key: string; name: string; params: { flavor: ServerFlavor } }>();
  const { flavor } = route.params;
  const sortListByTabScope = useLibraryDisplayStore((state) => state.sortListByTabScope);

  return (
    <View style={styles.container}>
      <LibraryTypeList
        flavor={flavor}
        sortListByTabScope={sortListByTabScope}
        onSelect={(libraryType) =>
          navigation.navigate(ROUTES.LIBRARY_SORT_TABS, { flavor, libraryType })
        }
      />
    </View>
  );
}

interface LibraryTypeListProps {
  flavor: ServerFlavor;
  sortListByTabScope: Record<string, SortByEnum[]>;
  onSelect: (libraryType: LibraryTypeEnum) => void;
}

function LibraryTypeList({ flavor, sortListByTabScope, onSelect }: LibraryTypeListProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const visibleTypes = libraryTypesOfFlavor(flavor);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>库类型</Text>
      <View style={styles.card}>
        {visibleTypes.map((libraryType) => {
          const tabs = tabsOfFlavor(libraryType, flavor);
          // 文件夹/收藏/已看/未看跟随主内容 Tab 排序，不计入可独立配置的 Tab
          const sortableTabs = tabs.filter(
            (tab) => !usesPrimarySortConfig(tab) && tab.sortSet !== 'none'
          );
          const sortableCount = sortableTabs.length;
          const customized = sortableTabs.some(
            (tab) =>
              sortListByTabScope[`${flavor}:${libraryType}:${tab.id}`] !== undefined
          );
          return (
            <SettingRow
              key={libraryType}
              label={LIBRARY_TYPE_LABELS[libraryType]}
              value={
                sortableCount === 0
                  ? '不支持排序'
                  : `${sortableCount} 个可排序 Tab${customized ? ' · 已自定义' : ''}`
              }
              showArrow={sortableCount > 0}
              onPress={sortableCount > 0 ? () => onSelect(libraryType) : undefined}
            />
          );
        })}
      </View>
    </ScrollView>
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
      borderRadius: POSTER_RADIUS,
      paddingHorizontal: SPACING.l,
    },
  });
