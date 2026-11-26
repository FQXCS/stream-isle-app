/**
 * TV 延时步进器（TV-m3 §4.3，照抄手机 DelayStepper 契约的 TV 改造）：
 * 数值框 + −/+ 分段按钮，步长 DELAY_STEP_MS、±DELAY_LIMIT_MS clamp。
 * TV 改造：手机「点按数值框归零」改长按归零（D-pad 无点按语义，OK 短按不触发归零防误触）；
 * −/+ 天然 D-pad 友好（聚焦后 OK 步进）。disabled 置灰且不可聚焦（烧录/未开字幕等场景）。
 */
import { StyleSheet, Text, View } from 'react-native';

import { DELAY_LIMIT_MS, DELAY_STEP_MS } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';

import { TvPressable } from '@tv/component/TvPressable';

interface TvDelayStepperProps {
  /** 当前延时毫秒数（正=延后 负=提前） */
  valueMs: number;
  onChange: (valueMs: number) => void;
  /** 不可调节（置灰且不可聚焦） */
  disabled?: boolean;
  /** 无障碍语义名（如「字幕延时」） */
  label: string;
}

export function TvDelayStepper({ valueMs, onChange, disabled = false, label }: TvDelayStepperProps) {
  const tr = useT();
  const stepSeconds = (DELAY_STEP_MS / 1000).toFixed(1);
  const seconds = (valueMs / 1000).toFixed(1);
  // 正值显式带 + 号，负值自带 - 号，0 显示 0.0
  const valueText = valueMs > 0 ? `+${seconds}` : seconds;

  const step = (deltaMs: number) => {
    onChange(Math.min(DELAY_LIMIT_MS, Math.max(-DELAY_LIMIT_MS, valueMs + deltaMs)));
  };

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <TvPressable
        focusKind="row"
        focusable={!disabled}
        style={styles.valueBox}
        onLongPress={() => onChange(0)}
        accessibilityLabel={tr('tv.delayReset', { label, value: valueText })}
      >
        <Text style={styles.valueText}>{valueText}</Text>
      </TvPressable>
      <View style={styles.stepGroup}>
        <TvPressable
          focusKind="row"
          focusable={!disabled}
          style={styles.stepButton}
          onPress={() => step(-DELAY_STEP_MS)}
          accessibilityLabel={tr('player.delayDecrease', { label, step: stepSeconds })}
        >
          <Text style={styles.stepText}>−</Text>
        </TvPressable>
        <View style={styles.stepDivider} />
        <TvPressable
          focusKind="row"
          focusable={!disabled}
          style={styles.stepButton}
          onPress={() => step(DELAY_STEP_MS)}
          accessibilityLabel={tr('player.delayIncrease', { label, step: stepSeconds })}
        >
          <Text style={styles.stepText}>+</Text>
        </TvPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.m },
  disabled: { opacity: 0.45 },
  valueBox: {
    minWidth: 96,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  valueText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
  stepGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  stepButton: { paddingVertical: SPACING.m, paddingHorizontal: SPACING.l },
  stepText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
  stepDivider: { width: 1, height: FONT_SIZE.title, backgroundColor: 'rgba(255,255,255,0.18)' },
});