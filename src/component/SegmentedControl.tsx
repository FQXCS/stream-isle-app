/**
 * 分段控件（库页视图/筛选切换）：
 * 胶囊轨道 + 滑块式选中段（白底轻阴影），未选中为次级灰字。
 * 选项为互斥单选；库页最多 5 段（标签简短时等分可容纳），更多选项应改用菜单/弹层。
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
      {optionList.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={({ pressed }) => [
              styles.segment,
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
      padding: 3,
      borderRadius: 999,
      backgroundColor: t.surfaceSunken,
    },
    segment: {
      flex: 1,
      height: 34,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: t.surface,
      shadowColor: '#0A2A33',
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    pressed: { opacity: 0.7 },
    label: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1, fontWeight: '500' },
    labelActive: { color: t.textPrimary, fontWeight: '700' },
  });
