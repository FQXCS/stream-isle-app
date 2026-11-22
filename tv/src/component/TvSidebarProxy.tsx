/**
 * 侧栏功能镜像代理（TV-m1-S3 实测定案组件）：
 * 内容区方向键被 ScrollView 树恒消费（arrowScroll return true），窗口级焦点搜索永不发生，
 * 侧栏（任何 ScrollView 子树外）无法经方向键直达——本代理渲染于内容区纵向 ScrollView 子树内
 * （跳板 nextFocusUp 的 arrowScroll findUserSetNextFocus 子树寻址可达），常态隐形（1dp），
 * 聚焦时展开为侧栏当前项的镜像（icon + label 竖排，88dp 与侧栏收起态同宽）：
 * CENTER 选中当前 tab（onSelect 等效侧栏确认）、RIGHT/DOWN 回内容区。
 * m2 升级 RN（enableImperativeFocus 开放或原生补丁）后本代理可替换为真正的侧栏聚焦。
 */
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import type { AppIconName } from '@/component/AppIcon';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvFocusStyle } from '@tv/component/TvFocusStyle';
import { useTvTheme } from '@tv/component/useTvTheme';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvSidebarProxyProps {
  icon: AppIconName;
  label: string;
  /** 实例上抛（跳板 nextFocusUp 寻址） */
  onTag(tag: number | null): void;
  /** CENTER 动作（Shell 下发：m1 为 tab 循环切换——真侧栏聚焦受 ScrollView 树限制） */
  onPress(): void;
}

export function TvSidebarProxy({ icon, label, onTag, onPress }: TvSidebarProxyProps) {
  console.log('[TV-debug] proxy render');
  const t = useTvTheme();
  const { focused, onFocus: focusIn, onBlur: focusOut } = useTvFocusStyle('row');
  return (
    <TvPressable
      focusKind="row"
      focusable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[styles.proxy, focused && styles.proxyFocused]}
      onFocus={focusIn}
      onBlur={focusOut}
      ref={(ref) => onTag(findNodeHandleTagOf(ref))}
      onPress={onPress}
    >
      {focused && (
        <View style={styles.proxyInner}>
          <AppIcon name={icon} size={26} color={t.accent} />
          <Text style={[styles.proxyLabel, { color: t.textPrimary }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  proxy: {
    // top 0（视口左上；tv-s48 实测该位置 UP 可命中；280 位置实测 UP 落刷新按钮）
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  proxyFocused: {
    width: 88,
    height: 88,
    opacity: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  proxyInner: { alignItems: 'center', gap: 4 },
  proxyLabel: { fontSize: 14, fontWeight: '600' },
});
