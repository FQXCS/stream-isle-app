/**
 * 加载态组件（M4 §4.2 终态接口；M6 主题 token 化）：可选文案（缺省纯指示器）。
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface LoadingViewProps {
  /** 可选加载文案 */
  label?: string;
}

export function LoadingView({ label }: LoadingViewProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={t.accent} />
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

/** 样式工厂（token 注入；M6 主题 sweep 统一模式） */
const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bg,
      padding: SPACING.m,
      gap: SPACING.s,
    },
    label: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  });
