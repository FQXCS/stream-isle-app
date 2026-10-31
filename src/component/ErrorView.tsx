/**
 * 页面级错误组件（04 §4.2 终态接口）：文案一律取 ERROR_MESSAGE_MAP 唯一出处；
 * 仅 isRetryable(code) 且传入 onRetry 时才渲染「重试」按钮；extraAction 扩展位
 * （如已登录态 TLS_ERROR 的「去设置」）。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { errorMessageOf, isRetryable, type AppError } from '@/infra/error';

interface ErrorViewProps {
  /** 业务错误（文案经 errorMessageOf 查询，页面不自行定义文案） */
  error: AppError;
  /** 重试回调（可重试码且传入时才渲染「重试」按钮，04 §4.2） */
  onRetry?: () => void;
  /** 扩展动作（如已登录态 TLS_ERROR 的「去设置」） */
  extraAction?: { label: string; onPress: () => void };
}

export function ErrorView({ error, onRetry, extraAction }: ErrorViewProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const showRetry = onRetry !== undefined && isRetryable(error.code);
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{errorMessageOf(error.code)}</Text>
      {extraAction !== undefined && (
        <Pressable style={[styles.button, styles.extraButton]} onPress={extraAction.onPress}>
          <Text style={styles.buttonText}>{extraAction.label}</Text>
        </Pressable>
      )}
      {showRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>重试</Text>
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
    gap: SPACING.m,
  },
  message: {
    color: t.textSecondary,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: t.accent,
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.s,
  },
  extraButton: { backgroundColor: t.surface },
  buttonText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
});
