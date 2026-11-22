/**
 * 收录类型设置二级页：继续观看 / 观看历史分别多选收录的媒体类型。
 * 两组可选类型不同：继续观看仅视频类（依赖服务端播放断点 PlaybackPositionTicks）；
 * 观看历史额外支持图书/音乐（服务端已看态）。每组至少保留一项（最后一项 Switch 禁用）。
 */
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '@/component/useTheme';
import { HISTORY_TYPE_OPTIONS, RESUME_TYPE_OPTIONS } from '@/constant/browse';
import { FONT_SIZE, CARD_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';

export function MediaTypeSettingsScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const resumeTypeList = useSettingsStore((state) => state.resumeTypeList);
  const historyTypeList = useSettingsStore((state) => state.historyTypeList);
  const { toggleResumeType, toggleHistoryType } = useSettingsStore((state) => state.actions);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{tr('server.sectionResume')}</Text>
      <View style={styles.card}>
        {RESUME_TYPE_OPTIONS.map((option, index) => {
          const active = resumeTypeList.includes(option.type);
          return (
            <View
              key={option.type}
              style={[styles.row, index < RESUME_TYPE_OPTIONS.length - 1 && styles.rowDivider]}
            >
              <Text style={styles.rowLabel}>{tr(option.labelKey)}</Text>
              <Switch
                value={active}
                disabled={active && resumeTypeList.length === 1}
                onValueChange={() => toggleResumeType(option.type)}
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{tr('settings.history')}</Text>
      <View style={styles.card}>
        {HISTORY_TYPE_OPTIONS.map((option, index) => {
          const active = historyTypeList.includes(option.type);
          return (
            <View
              key={option.type}
              style={[styles.row, index < HISTORY_TYPE_OPTIONS.length - 1 && styles.rowDivider]}
            >
              <Text style={styles.rowLabel}>{tr(option.labelKey)}</Text>
              <Switch
                value={active}
                disabled={active && historyTypeList.length === 1}
                onValueChange={() => toggleHistoryType(option.type)}
              />
            </View>
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
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.l,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      gap: SPACING.m,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.separator,
    },
    rowLabel: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  });
