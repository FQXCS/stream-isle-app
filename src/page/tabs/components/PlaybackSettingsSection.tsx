/**
 * 设置页「播放」分组：最大转码分辨率（原画/4K/1080p/720p/480p）、「允许 HEVC 直连」开关、
 * 「蜂窝自动降档」开关、「断点续播」开关。写入即调 settingsStore 对应 action（persist 生效），
 * 不做确认弹窗；分辨率档与播放器 ResolutionMenu 用同一 action，杜绝两处落盘语义分叉。
 */
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { RadioOptionSheet } from '@/component/RadioOptionSheet';
import { SettingRow } from '@/component/SettingRow';
import {
  RESOLUTION_TIER_LIST,
  RESOLUTION_TIER_MAP,
  type ResolutionTierKey,
} from '@/constant/resolution';
import {
  CARD_RADIUS,
  CARD_SHADOW,
  FONT_SIZE,
  SPACING,
  type ThemeTokens,
} from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useSettingsStore } from '@/store/settingsStore';

/** 开关行（标签 + 说明文案 + Switch） */
function SettingSwitchRow(props: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.switchRowWrap}>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{props.label}</Text>
        <Text style={styles.rowDescription}>{props.description}</Text>
      </View>
      <Switch value={props.value} onValueChange={props.onValueChange} />
    </View>
  );
}

export function PlaybackSettingsSection() {
  const t = useTheme();
  const styles = createStyles(t);
  const maxResolutionTier = useSettingsStore((state) => state.maxResolutionTier);
  const allowHevcDirectPlay = useSettingsStore((state) => state.allowHevcDirectPlay);
  const autoDowngradeOnCellular = useSettingsStore((state) => state.autoDowngradeOnCellular);
  const resumePlaybackEnabled = useSettingsStore((state) => state.resumePlaybackEnabled);
  const { setMaxResolutionTier, setAllowHevcDirectPlay, setAutoDowngradeOnCellular, setResumePlaybackEnabled } =
    useSettingsStore((state) => state.actions);
  const [resolutionSheetOpen, setResolutionSheetOpen] = useState(false);

  return (
    <View style={styles.card}>
      <Text style={styles.groupTitle}>播放</Text>
      <SettingRow
        label="最大转码分辨率"
        description="转码输出的分辨率上限（直连不受影响）"
        value={RESOLUTION_TIER_MAP[maxResolutionTier].label}
        showArrow
        onPress={() => setResolutionSheetOpen(true)}
      />
      <SettingSwitchRow
        label="允许 HEVC 直连"
        description="异常机型可关闭，改为全量转码"
        value={allowHevcDirectPlay}
        onValueChange={setAllowHevcDirectPlay}
      />
      <SettingSwitchRow
        label="蜂窝自动降档"
        description="蜂窝网络默认降至 480p，可手动更改"
        value={autoDowngradeOnCellular}
        onValueChange={setAutoDowngradeOnCellular}
      />
      <SettingSwitchRow
        label="断点续播"
        description="从上次停止位置继续；关闭后每次从头播放"
        value={resumePlaybackEnabled}
        onValueChange={setResumePlaybackEnabled}
      />
      <RadioOptionSheet
        title="最大转码分辨率"
        visible={resolutionSheetOpen}
        selectedKey={maxResolutionTier}
        optionList={RESOLUTION_TIER_LIST.map((tier) => ({ key: tier.key, label: tier.label }))}
        onSelect={(key) => setMaxResolutionTier(key as ResolutionTierKey)}
        onClose={() => setResolutionSheetOpen(false)}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    gap: 2,
    ...CARD_SHADOW,
  },
  groupTitle: {
    color: t.textTertiary,
    fontSize: FONT_SIZE.caption + 1,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: SPACING.xs,
  },
  switchRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    minHeight: 52,
    paddingVertical: SPACING.s + 2,
  },
  rowTextWrap: { flex: 1, gap: 3 },
  rowLabel: { color: t.textPrimary, fontSize: FONT_SIZE.title - 1, fontWeight: '500' },
  rowDescription: {
    color: t.textTertiary,
    fontSize: FONT_SIZE.caption,
    lineHeight: 16,
  },
});
