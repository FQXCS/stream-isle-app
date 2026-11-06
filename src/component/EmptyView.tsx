/**
 * 空态组件（04 §4.2 终态接口）：图标 + 标题 + 可选副标题与操作按钮
 * （如海报墙筛选无结果的「清除筛选」）。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface EmptyViewProps {
  /** 空态标题 */
  title: string;
  /** 可选说明文案 */
  subtitle?: string;
  /** 可选操作按钮文案（与 onAction 成对出现才渲染） */
  actionLabel?: string;
  /** 操作回调 */
  onAction?: () => void;
}

export function EmptyView({ title, subtitle, actionLabel, onAction }: EmptyViewProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const showAction = actionLabel !== undefined && onAction !== undefined;
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <AppIcon name="empty" size={30} color={t.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
      {showAction && (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={onAction}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bg,
      padding: SPACING.xl,
      gap: SPACING.s,
    },
    iconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentSoft,
      marginBottom: SPACING.xs,
    },
    title: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.title,
      fontWeight: '600',
      textAlign: 'center',
    },
    subtitle: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body - 2,
      lineHeight: 19,
      textAlign: 'center',
      maxWidth: 300,
    },
    button: {
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingHorizontal: SPACING.xl,
      paddingVertical: 10,
      marginTop: SPACING.s,
    },
    pressed: { opacity: 0.8 },
    buttonText: { color: t.accentOn, fontSize: FONT_SIZE.body, fontWeight: '600' },
  });
