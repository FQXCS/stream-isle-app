/**
 * 缓冲设置二级页（设置 → 缓冲进入）：缓冲档位（省流/平衡/顺滑/不设限/自定义）单选弹层 +
 * 自定义参数（缓冲时长 秒/片长% 二选一 + 内存上限 MB）。写入即调 settingsStore action（persist 生效），
 * 下次起播生效（source.bufferConfig 路径，与分辨率切换同机制）。数字输入编辑期不 clamp，
 * 失焦提交后由 store clampCustomBuffer 统一归一；外部值变化由父级 key 重挂载重置草稿文本。
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { RadioOptionSheet } from '@/component/RadioOptionSheet';
import { SegmentedControl, type SegmentedOption } from '@/component/SegmentedControl';
import { SettingRow } from '@/component/SettingRow';
import { useTheme } from '@/component/useTheme';
import { BUFFER_TIER_LIST, BUFFER_TIER_MAP, type BufferTierKey } from '@/constant/buffer';
import { CARD_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import type { CustomBufferSettings } from '@/util/buffer';

/** 数字输入块（可选标签/说明 + 全宽输入框带单位后缀）：失焦解析回写，clamp 交 store */
function NumberInputRow(props: {
  label?: string;
  description?: string;
  value: number;
  /** 输入框右侧单位后缀（秒 / % / MB） */
  unit: string;
  onChange: (value: number) => void;
}) {
  const t = useTheme();
  const styles = createStyles(t);
  // 本地草稿文本（编辑期不 clamp）；外部值变化由父级 key 重挂载重置，无需 effect 同步 setState
  const [text, setText] = useState(String(props.value));
  const commit = () => {
    const parsed = parseInt(text, 10);
    const next = Number.isNaN(parsed) ? props.value : parsed;
    props.onChange(next);
    setText(String(next));
  };
  return (
    <View style={styles.fieldBlock}>
      {props.label !== undefined && <Text style={styles.rowLabel}>{props.label}</Text>}
      {props.description !== undefined && <Text style={styles.rowDescription}>{props.description}</Text>}
      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onEndEditing={commit}
          onBlur={commit}
          keyboardType="numeric"
          maxLength={6}
          selectTextOnFocus
          accessibilityLabel={props.label ?? props.unit}
        />
        <Text style={styles.unit}>{props.unit}</Text>
      </View>
    </View>
  );
}

export function BufferSettingsScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const bufferTier = useSettingsStore((state) => state.bufferTier);
  const customBuffer = useSettingsStore((state) => state.customBuffer);
  const { setBufferTier, setCustomBuffer } = useSettingsStore((state) => state.actions);
  const [tierSheetOpen, setTierSheetOpen] = useState(false);

  const timeModeOptions: SegmentedOption<CustomBufferSettings['timeMode']>[] = [
    { value: 'seconds', label: tr('settings.bufferTimeSeconds') },
    { value: 'percent', label: tr('settings.bufferTimePercent') },
  ];
  const isPercent = customBuffer.timeMode === 'percent';
  const timeValue = isPercent ? customBuffer.percent : customBuffer.seconds;
  const isBackPercent = customBuffer.backTimeMode === 'percent';
  const backValue = isBackPercent ? customBuffer.backPercent : customBuffer.backSeconds;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <SettingRow
          label={tr('settings.bufferTier')}
          description={tr('settings.bufferTierDesc')}
          value={tr(BUFFER_TIER_MAP[bufferTier].labelKey)}
          showArrow
          onPress={() => setTierSheetOpen(true)}
        />
      </View>
      {bufferTier === 'CUSTOM' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tr('settings.bufferCustomTime')}</Text>
          <Text style={styles.rowDescription}>{tr('settings.bufferCustomTimeDesc')}</Text>
          <SegmentedControl
            optionList={timeModeOptions}
            value={customBuffer.timeMode}
            onChange={(mode) => setCustomBuffer({ timeMode: mode })}
          />
          <NumberInputRow
            key={`time-${customBuffer.timeMode}-${timeValue}`}
            value={timeValue}
            unit={isPercent ? '%' : tr('settings.bufferTimeSeconds')}
            onChange={(value) => setCustomBuffer(isPercent ? { percent: value } : { seconds: value })}
          />
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>{tr('settings.bufferCustomBack')}</Text>
          <Text style={styles.rowDescription}>{tr('settings.bufferCustomBackDesc')}</Text>
          <SegmentedControl
            optionList={timeModeOptions}
            value={customBuffer.backTimeMode}
            onChange={(mode) => setCustomBuffer({ backTimeMode: mode })}
          />
          <NumberInputRow
            key={`back-${customBuffer.backTimeMode}-${backValue}`}
            value={backValue}
            unit={isBackPercent ? '%' : tr('settings.bufferTimeSeconds')}
            onChange={(value) => setCustomBuffer(isBackPercent ? { backPercent: value } : { backSeconds: value })}
          />
          <View style={styles.divider} />
          <NumberInputRow
            key={`mb-${customBuffer.mb}`}
            label={tr('settings.bufferCustomMb')}
            description={tr('settings.bufferCustomMbDesc')}
            value={customBuffer.mb}
            unit="MB"
            onChange={(value) => setCustomBuffer({ mb: value })}
          />
        </View>
      )}
      <RadioOptionSheet
        title={tr('settings.bufferTier')}
        visible={tierSheetOpen}
        selectedKey={bufferTier}
        optionList={BUFFER_TIER_LIST.map((tier) => ({
          key: tier.key,
          label: tr(tier.labelKey),
          description: tr(tier.descKey),
        }))}
        onSelect={(key) => setBufferTier(key as BufferTierKey)}
        onClose={() => setTierSheetOpen(false)}
      />
    </ScrollView>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: SPACING.l, gap: SPACING.m },
    card: {
      backgroundColor: t.surface,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.s,
    },
    sectionTitle: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.title - 1,
      fontWeight: '500',
      marginTop: SPACING.s,
    },
    rowDescription: { color: t.textTertiary, fontSize: FONT_SIZE.caption, lineHeight: 16 },
    rowLabel: { color: t.textPrimary, fontSize: FONT_SIZE.title - 1, fontWeight: '500' },
    fieldBlock: { gap: SPACING.xs, paddingVertical: SPACING.s },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.separator,
      marginVertical: SPACING.xs,
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.separator,
      borderRadius: CARD_RADIUS,
      backgroundColor: t.surfaceSunken,
      paddingHorizontal: SPACING.m,
    },
    input: {
      flex: 1,
      color: t.textPrimary,
      fontSize: FONT_SIZE.body,
      paddingVertical: SPACING.s + 2,
    },
    unit: { color: t.textTertiary, fontSize: FONT_SIZE.body, marginLeft: SPACING.s },
  });