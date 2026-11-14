/**
 * 延时步进器（M8 音画同步延时，参考图口径）：数值框（点按归零）+ −/+ 分段按钮。
 * 步长 DELAY_STEP_MS、±DELAY_LIMIT_MS clamp；设置抽屉音频/字幕页共用。
 * disabled 置灰（烧录/本地内嵌字幕等不可延时场景），说明文案由父级 notice 承载。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DELAY_LIMIT_MS, DELAY_STEP_MS } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';

interface DelayStepperProps {
  /** 当前延时毫秒数（正=延后 负=提前） */
  valueMs: number;
  onChange: (valueMs: number) => void;
  /** 不可调节（置灰且屏蔽按压） */
  disabled?: boolean;
  /** 无障碍语义名（如「字幕延时」） */
  label: string;
}

export function DelayStepper({ valueMs, onChange, disabled = false, label }: DelayStepperProps) {
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
      <Pressable
        style={styles.valueBox}
        onPress={() => onChange(0)}
        disabled={disabled}
        accessibilityLabel={tr('player.delayReset', { label, value: valueText })}
      >
        <Text style={styles.valueText}>{valueText}</Text>
      </Pressable>
      <View style={styles.stepGroup}>
        <Pressable
          style={styles.stepButton}
          onPress={() => step(-DELAY_STEP_MS)}
          disabled={disabled}
          accessibilityLabel={tr('player.delayDecrease', { label, step: stepSeconds })}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <View style={styles.stepDivider} />
        <Pressable
          style={styles.stepButton}
          onPress={() => step(DELAY_STEP_MS)}
          disabled={disabled}
          accessibilityLabel={tr('player.delayIncrease', { label, step: stepSeconds })}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
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