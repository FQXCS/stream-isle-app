/**
 * 设置页「播放」分组（M3 文档 §4.13）：码率档位四选一、「允许 HEVC 直连」开关、
 * 「蜂窝自动降档」开关。写入即调 settingsStore 对应 action（persist 生效），不做确认弹窗；
 * 档位与播放器 BitrateMenu 用同一 action，杜绝两处落盘语义分叉。
 * 完整设置页打磨归 M4（preferredSubtitleLang UI 一并归 M4）。
 */
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { BITRATE_TIER_LIST, type BitrateTierKey } from '@/constant/bitrate';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
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
  const maxBitrateMode = useSettingsStore((state) => state.maxBitrateMode);
  const allowHevcDirectPlay = useSettingsStore((state) => state.allowHevcDirectPlay);
  const autoDowngradeOnCellular = useSettingsStore((state) => state.autoDowngradeOnCellular);
  const { setMaxBitrateMode, setAllowHevcDirectPlay, setAutoDowngradeOnCellular } =
    useSettingsStore((state) => state.actions);

  return (
    <View style={styles.card}>
      <Text style={styles.groupTitle}>播放</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>码率档位</Text>
        <View style={styles.tierList}>
          {BITRATE_TIER_LIST.map((tier) => {
            const active = tier.key === maxBitrateMode;
            return (
              <Pressable
                key={tier.key}
                style={[styles.tierButton, active && styles.tierButtonActive]}
                onPress={() => setMaxBitrateMode(tier.key as BitrateTierKey)}
              >
                <Text style={[styles.tierText, active && styles.tierTextActive]}>
                  {tier.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <SettingSwitchRow
        label="允许 HEVC 直连"
        description="异常机型可关闭，改为全量转码"
        value={allowHevcDirectPlay}
        onValueChange={setAllowHevcDirectPlay}
      />
      <SettingSwitchRow
        label="蜂窝自动降档"
        description="蜂窝网络自动降至 4Mbps"
        value={autoDowngradeOnCellular}
        onValueChange={setAutoDowngradeOnCellular}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.l,
    gap: SPACING.m,
  },
  groupTitle: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.m },
  switchRowWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.m },
  rowTextWrap: { flex: 1, gap: 2 },
  rowLabel: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  rowDescription: { color: t.textSecondary, fontSize: FONT_SIZE.body - 2 },
  tierList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  tierButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.textSecondary,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  tierButtonActive: { borderColor: t.accent, backgroundColor: 'rgba(76,141,255,0.2)' },
  tierText: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  tierTextActive: { color: t.textPrimary },
});
