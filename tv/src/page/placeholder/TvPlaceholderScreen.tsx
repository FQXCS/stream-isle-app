/**
 * TV 占位屏（TV-m1 §4.1）：搜索/设置 m1 为占位（m2/m4 替换正式屏）——
 * 居中提示文案 + 可聚焦「去首页」元素（验收 #5 焦点可达）。
 */
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { useT } from '@/i18n';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

interface TvPlaceholderScreenProps {
  message: string;
  /** 可聚焦返回元素：D-pad 确认后回首页 */
  onGoHome(): void;
  /** LEFT 回侧栏的引导目标 tag（占位屏元素与侧栏项 y 不重叠，几何搜索命中不了，需显式 nextFocus） */
  nextFocusLeftTag?: number;
}

export function TvPlaceholderScreen({
  message,
  onGoHome,
  nextFocusLeftTag,
}: TvPlaceholderScreenProps) {
  const t = useTvTheme();
  const tr = useT();
  return (
    <View style={styles.box}>
      <AppIcon name="info" size={44} color={t.textTertiary} />
      <Text style={[styles.message, { color: t.textSecondary }]}>{message}</Text>
      <TvPressable
        focusKind="row"
        focusable
        hasTVPreferredFocus
        accessibilityRole="button"
        accessibilityLabel={tr('tv.tabHome')}
        onPress={onGoHome}
        style={styles.homeButton}
        nextFocusLeft={nextFocusLeftTag}
      >
        <Text style={[styles.homeText, { color: t.textPrimary }]}>{tr('tv.tabHome')}</Text>
      </TvPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  message: { fontSize: 18, textAlign: 'center', lineHeight: 26 },
  homeButton: { borderRadius: 12, paddingHorizontal: 36, paddingVertical: 14 },
  homeText: { fontSize: 18, fontWeight: '600' },
});
