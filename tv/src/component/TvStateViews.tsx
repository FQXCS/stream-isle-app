/**
 * TV 页面三态视图（TV-m1 §4.4；与手机 ErrorView/LoadingView/EmptyView 同职责，TV 侧自绘：
 * @/component 仅白名单三件可 import）。错误文案走共享 errorMessageOf（验收 #9）。
 */
import { StyleSheet, Text, View } from 'react-native';

import type { AppError } from '@/infra/error';
import { errorMessageOf } from '@/infra/error';
import { AppIcon } from '@/component/AppIcon';
import { useT } from '@/i18n';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

/** 页面错误态：归一化文案 + 重试按钮（hasTVPreferredFocus 保证 D-pad 可达） */
export function TvErrorView({ error, onRetry }: { error: AppError; onRetry(): void }) {
  const t = useTvTheme();
  const tr = useT();
  return (
    <View style={styles.box}>
      <AppIcon name="info" size={48} color={t.textTertiary} />
      <Text style={[styles.message, { color: t.textSecondary }]}>{errorMessageOf(error.code)}</Text>
      <TvPressable
        focusKind="card"
        hasTVPreferredFocus
        accessibilityRole="button"
        accessibilityLabel={tr('common.retry')}
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Text style={[styles.retryText, { color: t.textPrimary }]}>{tr('common.retry')}</Text>
      </TvPressable>
    </View>
  );
}

/** 页面加载态骨架：三行占位块（行式首页同构） */
export function TvLoadingSkeleton() {
  const t = useTvTheme();
  return (
    <View style={styles.skeletonBox}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.skeletonRow}>
          {[0, 1, 2, 3, 4].map((col) => (
            <View
              key={col}
              style={[styles.skeletonBlock, { backgroundColor: t.surfaceSunken }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** 页面空态：图标 + 标题 + 副标题 */
export function TvEmptyView({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTvTheme();
  return (
    <View style={styles.box}>
      <AppIcon name="empty" size={48} color={t.textTertiary} />
      <Text style={[styles.title, { color: t.textPrimary }]}>{title}</Text>
      {subtitle !== undefined && (
        <Text style={[styles.message, { color: t.textSecondary }]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  title: { fontSize: 22, fontWeight: '700' },
  message: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  retryButton: {
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  retryText: { fontSize: 18, fontWeight: '600' },
  skeletonBox: { flex: 1, gap: 28, paddingTop: 8 },
  skeletonRow: { flexDirection: 'row', gap: 16 },
  skeletonBlock: { width: 140, height: 200, borderRadius: 12 },
});
