/**
 * 单 Tab 排序编辑器：已启用区长按拖动排序（顺序即 SortMenu 展示顺序），
 * 未启用区开关启用；独立路由 push，保留原生滑动动画与动态标题。
 */
import { useRoute } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, ServerFlavor } from '@/adapter/model';
import type { SortOption } from '@/constant/browse';
import { DragHandle } from '@/component/DragHandle';
import { EmptyView } from '@/component/EmptyView';
import { SelectableRow } from '@/component/SelectableRow';
import { SortableSettingsList } from '@/component/SortableSettingsList';
import { useTheme } from '@/component/useTheme';
import { tabsOfFlavor } from '@/constant/libraryTabs';
import { SORT_CHAIN, SORT_OPTION_META, SORT_SETS } from '@/constant/sortCatalog';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { resolveTabSortOptions } from '@/util/libraryConfig';

interface LibrarySortEditorParams {
  flavor: ServerFlavor;
  libraryType: LibraryTypeEnum;
  tabId: string;
}

export function LibrarySortEditorScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const route = useRoute<{ key: string; name: string; params: LibrarySortEditorParams }>();
  const { flavor, libraryType, tabId } = route.params;
  const sortListByTabScope = useLibraryDisplayStore((state) => state.sortListByTabScope);
  const actions = useLibraryDisplayStore((state) => state.actions);
  const tab = tabsOfFlavor(libraryType, flavor).find((item) => item.id === tabId);

  if (tab === undefined) {
    return <EmptyView title="分类不存在" />;
  }

  if (tab.sortSet === 'none') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>该分类不支持排序</Text>
        </ScrollView>
      </View>
    );
  }

  const availableValues = SORT_SETS[tab.sortSet].available.filter(
    (value) => SORT_CHAIN[flavor][value] !== null
  );
  const enabledOptions = resolveTabSortOptions({
    flavor,
    libraryType,
    tab,
    sortOverrides: sortListByTabScope,
  });
  const enabledValues = new Set(enabledOptions.map((option) => option.value));
  const disabledOptions = availableValues
    .filter((value) => !enabledValues.has(value))
    .map((value) => SORT_OPTION_META[value]);
  const atMin = enabledOptions.length <= 1;

  return (
    <View style={styles.container}>
      <SortableSettingsList
        data={[...enabledOptions]}
        keyExtractor={(option) => option.value}
        onReorder={(orderedOptions) =>
          actions.reorderSorts(
            flavor,
            libraryType,
            tab.id,
            orderedOptions.map((option) => option.value)
          )
        }
        header={
          <Text style={styles.sectionTitle}>
            已启用（{enabledOptions.length} 项）· 长按 ≡ 拖动排序
          </Text>
        }
        renderItem={(option, drag) => (
          <View style={styles.rowCard}>
            <SelectableRow
              leading={<DragHandle onLongPress={drag} />}
              label={option.label}
              checked
              disabled={atMin}
              description={atMin ? '至少保留 1 个' : undefined}
              trailing={<Text style={styles.direction}>{directionOf(option)}</Text>}
              onToggle={() => actions.toggleSort(flavor, libraryType, tab.id, option.value)}
            />
          </View>
        )}
        footer={
          <View>
            {disabledOptions.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>未启用</Text>
                <View style={styles.card}>
                  {disabledOptions.map((option, index) => (
                    <SelectableRow
                      key={option.value}
                      label={option.label}
                      checked={false}
                      divider={index < disabledOptions.length - 1}
                      trailing={<Text style={styles.direction}>{directionOf(option)}</Text>}
                      onToggle={() =>
                        actions.toggleSort(flavor, libraryType, tab.id, option.value)
                      }
                    />
                  ))}
                </View>
              </>
            )}
            <Pressable
              style={styles.resetButton}
              onPress={() => actions.resetSorts(flavor, libraryType, tab.id)}
            >
              <Text style={styles.resetText}>恢复默认</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

function directionOf(option: SortOption): string {
  if (option.defaultOrder === null) {
    return '—';
  }
  return option.defaultOrder === 'DESC' ? '↓' : '↑';
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
    rowCard: {
      backgroundColor: t.surface,
      borderRadius: POSTER_RADIUS,
      overflow: 'hidden',
      marginBottom: SPACING.s,
    },
    direction: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    resetButton: { alignSelf: 'flex-start', padding: SPACING.m },
    resetText: { color: t.accent, fontSize: FONT_SIZE.body },
  });
