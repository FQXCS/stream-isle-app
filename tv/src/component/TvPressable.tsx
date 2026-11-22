/**
 * TV 页面唯一合法可点击件（TV-m1 §4.2；TV 设计 §7.1）：
 * 基于 fork Pressable（onFocus/onBlur/hasTVPreferredFocus）+ useTvFocusStyle 合成焦点视觉。
 * card 态：scale 1.06 + 3dp accent 描边 + 15% 辉光；row 态：accentSoft 背景、不缩放。
 * eslint no-restricted-syntax 禁止 tv/src 出现裸 <Pressable，视觉一律经本组件收口。
 */
import type { ComponentRef, ReactNode, Ref } from 'react';
import Animated from 'react-native-reanimated';
// 别名导入：本组件是「TV 唯一合法可点击件」的实现体（fork Pressable 包装），
// 规则 selector 只匹配裸 <Pressable> 名，别名使其豁免自身收口规则
import { Pressable as RNPressable, StyleSheet } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { useTvTheme } from '@tv/component/useTvTheme';
import {
  TV_FOCUS_BORDER_WIDTH,
  TV_FOCUS_GLOW_OPACITY,
  useTvFocusStyle,
  type TvFocusKind,
} from '@tv/component/TvFocusStyle';

const AnimatedView = Animated.View;

interface TvPressableProps extends PressableProps {
  /** 焦点视觉形态（缺省 row：行/按钮背景反馈） */
  focusKind?: TvFocusKind;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: ReactNode;
  /** React 19 ref-as-prop：透传内部 Pressable 实例（侧栏项实例注册等命令式聚焦场景） */
  ref?: Ref<ComponentRef<typeof RNPressable>>;
}

export function TvPressable({
  focusKind = 'row',
  style,
  onFocus,
  onBlur,
  ...rest
}: TvPressableProps) {
  const t = useTvTheme();
  const { focused, onFocus: focusIn, onBlur: focusOut, animatedStyle } = useTvFocusStyle(focusKind);
  // row 态焦点背景（accentSoft）；文字由调用方渲染（列表行/次级按钮均为 textPrimary 系，对比安全）
  const rowBackground: ViewStyle | null =
    focused && focusKind === 'row' ? { backgroundColor: t.accentSoft } : null;
  // card 态：描边常驻占位（borderWidth 不变、色值透明↔accent 切换，避免布局跳动）+ 辉光
  const cardRing: ViewStyle =
    focusKind === 'card'
      ? {
          borderWidth: TV_FOCUS_BORDER_WIDTH,
          borderColor: focused ? t.accent : 'transparent',
          shadowColor: t.accent,
          shadowOpacity: focused ? TV_FOCUS_GLOW_OPACITY : 0,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
        }
      : {};
  return (
    <AnimatedView style={focusKind === 'card' ? [styles.grow, animatedStyle] : null}>
      <RNPressable
        {...rest}
        style={(state) => {
          const base = typeof style === 'function' ? style(state) : style;
          return [base, rowBackground, cardRing];
        }}
        onFocus={(event) => {
          focusIn();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          focusOut();
          onBlur?.(event);
        }}
      />
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  // 外层动画容器随内层卡片同尺寸（scale 变换不动布局）
  grow: { alignSelf: 'flex-start' },
});
