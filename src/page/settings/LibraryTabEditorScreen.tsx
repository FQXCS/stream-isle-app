/**
 * 某库类型的 Tab 编辑器：已启用区长按拖动排序，未启用区开关启用；
 * 作为独立路由 push，保留原生滑动动画与动态标题。
 */
import { useRoute } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryTypeEnum, ServerFlavor } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { DragHandle } from '@/component/DragHandle';
import { SelectableRow } from '@/component/SelectableRow';
import { SortableSettingsList } from '@/component/SortableSettingsList';
import { useTheme } from '@/component/useTheme';
import { MAX_LIBRARY_TABS, tabsOfFlavor } from '@/constant/libraryTabs';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { resolveTabList } from '@/util/libraryConfig';

interface LibraryTabEditorParams {
  flavor: ServerFlavor;
  libraryType: LibraryTypeEnum;
}

export function LibraryTabEditorScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const route = useRoute<{ key: string; name: string; params: LibraryTabEditorParams }>();
  const { flavor, libraryType } = route.params;
  const tabListByScope = useLibraryDisplayStore((state) => state.tabListByScope);
  const actions = useLibraryDisplayStore((state) => state.actions);

  const allTabs = tabsOfFlavor(libraryType, flavor);
  const enabledTabs = resolveTabList({ flavor, libraryType, tabOverrides: tabListByScope });
  const enabledIds = new Set(enabledTabs.map((tab) => tab.id));
  const disabledTabs = allTabs.filter((tab) => !enabledIds.has(tab.id));
  const atMax = enabledTabs.length >= MAX_LIBRARY_TABS;
  const atMin = enabledTabs.length <= 1;

  return (
    <View style={styles.container}>
      <SortableSettingsList
        data={[...enabledTabs]}
        keyExtractor={(tab) => tab.id}
        onReorder={(orderedTabs) =>
          actions.reorderTabs(
            flavor,
            libraryType,
            orderedTabs.map((tab) => tab.id)
          )
        }
        header={
          <View style={styles.hintRow}>
            <Text style={styles.hintText}>
              已启用（{enabledTabs.length}/{MAX_LIBRARY_TABS}）· 长按
            </Text>
            <AppIcon name="dragHandle" size={12} color={t.textSecondary} />
            <Text style={styles.hintText}>拖动排序</Text>
          </View>
        }
        renderItem={(tab, drag) => (
          <View style={styles.rowCard}>
            <SelectableRow
              leading={<DragHandle onLongPress={drag} />}
              label={tab.label}
              checked
              disabled={atMin}
              description={atMin ? '至少保留 1 个' : undefined}
              onToggle={() => actions.toggleTab(flavor, libraryType, tab.id)}
            />
          </View>
        )}
        footer={
          <View>
            {disabledTabs.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>未启用</Text>
                <View style={styles.card}>
                  {disabledTabs.map((tab, index) => (
                    <SelectableRow
                      key={tab.id}
                      label={tab.label}
                      checked={false}
                      disabled={atMax}
                      description={atMax ? '最多 5 个' : undefined}
                      divider={index < disabledTabs.length - 1}
                      onToggle={() => actions.toggleTab(flavor, libraryType, tab.id)}
                    />
                  ))}
                </View>
              </>
            )}
            <Pressable
              style={styles.resetButton}
              onPress={() => actions.resetTabs(flavor, libraryType)}
            >
              <Text style={styles.resetText}>恢复默认</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    sectionTitle: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body - 1,
      paddingHorizontal: SPACING.s,
      marginTop: SPACING.s,
      marginBottom: SPACING.xs,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: SPACING.s,
      marginTop: SPACING.s,
      marginBottom: SPACING.xs,
    },
    hintText: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
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
    resetButton: { alignSelf: 'flex-start', padding: SPACING.m },
    resetText: { color: t.accent, fontSize: FONT_SIZE.body },
  });
