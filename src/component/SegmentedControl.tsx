/**
 * 分段控件（库页视图/筛选切换，参考稿样式）：
 * 整条圆角外框 + 等分段落 + 段间分隔线，选中段为主色淡底 + 主色文字。
 * 选项为互斥单选，2–4 段为宜（段数过多会挤压文字，>4 段应改用菜单/弹层）。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** 单个分段选项 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  optionList: readonly SegmentedOption<T>[];
  /** 当前选中值 */
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  optionList,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.container}>
      {optionList.map((option, index) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={({ pressed }) => [
              styles.segment,
              index > 0 && styles.divider,
              active && styles.segmentActive,
              pressed && styles.pressed,
            ]}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      marginHorizontal: SPACING.m,
      marginTop: SPACING.s,
      marginBottom: SPACING.s,
      borderWidth: 1,
      borderColor: t.separator,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: t.surface,
    },
    segment: {
      flex: 1,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: { borderLeftWidth: 1, borderLeftColor: t.separator },
    segmentActive: { backgroundColor: t.accentSoft },
    pressed: { opacity: 0.7 },
    label: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    labelActive: { color: t.accent, fontWeight: '600' },
  });
