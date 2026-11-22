/**
 * TV 屏幕外框（TV-m1 §4.2；TV 设计 §10）：32dp overscan 外框 + t.bg 底，
 * 替代 TV 上为 0 的 SafeArea——TV 页面根容器统一入口。
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTvTheme } from '@tv/component/useTvTheme';

/** overscan 外框边距（TV 设计 §10；重点机型安全边距兜底） */
export const TV_OVERSCAN_PADDING = 32;

interface TvScreenFrameProps {
  children: ReactNode;
  /** 外框内布局补充（如壳的横向排布） */
  style?: StyleProp<ViewStyle>;
}

export function TvScreenFrame({ children, style }: TvScreenFrameProps) {
  const t = useTvTheme();
  return (
    <View style={[styles.frame, { backgroundColor: t.bg }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    padding: TV_OVERSCAN_PADDING,
  },
});
