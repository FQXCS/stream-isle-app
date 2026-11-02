/**
 * Tab 分类设置：指定服务器类型后展示库类型列表；
 * 选择库类型进入独立编辑页（原生 push 动画 + 动态标题）。
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, ServerFlavor } from '@/adapter/model';
import { SettingRow } from '@/component/SettingRow';
import { useTheme } from '@/component/useTheme';
import {
  LIBRARY_TYPE_LABELS,
  MAX_LIBRARY_TABS,
  libraryTypesOfFlavor,
} from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { resolveTabList } from '@/util/libraryConfig';

type SettingsNavigation = NativeStackNavigationProp<RootStackParamList>;

export function LibraryTabSettingsScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<SettingsNavigation>();
  const route = useRoute<{ key: string; name: string; params: { flavor: ServerFlavor } }>();
  const { flavor } = route.params;
  const tabListByScope = useLibraryDisplayStore((state) => state.tabListByScope);

  return (
    <View style={styles.container}>
      <LibraryTypeList
        flavor={flavor}
        tabListByScope={tabListByScope}
        onSelect={(libraryType) =>
          navigation.navigate(ROUTES.LIBRARY_TAB_EDITOR, { flavor, libraryType })
        }
      />
    </View>
  );
}

interface LibraryTypeListProps {
  flavor: ServerFlavor;
  tabListByScope: Record<string, string[]>;
  onSelect: (libraryType: LibraryTypeEnum) => void;
}

function LibraryTypeList({ flavor, tabListByScope, onSelect }: LibraryTypeListProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const libraryTypes = libraryTypesOfFlavor(flavor);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>库类型</Text>
      <View style={styles.card}>
        {libraryTypes.map((libraryType) => {
          const count = resolveTabList({
            flavor,
            libraryType,
            tabOverrides: tabListByScope,
          }).length;
          return (
            <SettingRow
              key={libraryType}
              label={LIBRARY_TYPE_LABELS[libraryType]}
              value={`${count}/${MAX_LIBRARY_TABS}`}
              showArrow
              onPress={() => onSelect(libraryType)}
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
