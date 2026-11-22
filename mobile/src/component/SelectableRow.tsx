/**
 * 设置页可选行：左（拖动把手）/ 标签与说明 / 右侧附件 / Switch。
 * 标签区域也可点击切换；disabled 时整行只读。
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface SelectableRowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  divider?: boolean;
  onToggle: () => void;
}

export function SelectableRow({
  label,
  description,
  checked,
  disabled = false,
  leading,
  trailing,
  divider = false,
  onToggle,
}: SelectableRowProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={[styles.row, divider && styles.divider]}>
      {leading}
      <Pressable
        style={styles.labelArea}
        onPress={disabled ? undefined : onToggle}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityState={{ checked, disabled }}
      >
        <Text style={[styles.label, disabled && styles.disabledText]}>{label}</Text>
        {description !== undefined && (
          <Text style={styles.description}>{description}</Text>
        )}
      </Pressable>
      {trailing}
      <Switch value={checked} disabled={disabled} onValueChange={onToggle} />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      gap: SPACING.s,
      paddingHorizontal: SPACING.m,
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.separator,
    },
    labelArea: { flex: 1, gap: 2 },
    label: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    disabledText: { color: t.textSecondary },
    description: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
  });
