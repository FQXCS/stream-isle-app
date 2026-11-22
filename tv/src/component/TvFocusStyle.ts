/**
 * TV 焦点视觉 hook（TV-m1 §4.2；TV 设计 §7.2）——全部焦点视觉的唯一出处，
 * 业务代码不手写焦点样式（eslint 禁裸 <Pressable 收口，视觉一律经 TvPressable 消费）。
 * card：reanimated scale 1.06（120ms ease-out）；row：不缩放，返回 focused 供背景 accentSoft。
 * 描边/辉光由 TvPressable 按 focused 合成。
 * 实现口径：React state + useAnimatedStyle 依赖数组 + worklet 内 withTiming
 * （reanimated 官方「按 React state 驱动」模式，不用 useSharedValue——避免 compiler
 * lint 对 shared value 可变性的误报）。
 */
import { useCallback, useState } from 'react';
import { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';

/** 焦点视觉形态：card=海报卡（缩放+描边+辉光）；row=行/按钮（背景反馈，不缩放防列表抖动） */
export type TvFocusKind = 'card' | 'row';

/** 焦点缩放初值（TV 设计 §7.2；m1 实测定案记 decision，见 docs/decision TV-m1 条目） */
export const TV_FOCUS_SCALE = 1.06;

/** 焦点动效时长（≤150ms，TV 设计 §10 动效约束） */
export const TV_FOCUS_TIMING_MS = 120;

/** 焦点描边宽度（3dp，TV 设计 §7.2） */
export const TV_FOCUS_BORDER_WIDTH = 3;

/** 焦点辉光强度（accent 15% 透明度外阴影，TV 设计 §7.2） */
export const TV_FOCUS_GLOW_OPACITY = 0.15;

export interface TvFocusStyleResult {
  focused: boolean;
  onFocus(): void;
  onBlur(): void;
  /** card 态缩放动效（row 态恒 1，挂 style 无副作用） */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
}

/** 焦点视觉 hook：onFocus/onBlur 需挂到可聚焦件（fork Pressable 支持） */
export function useTvFocusStyle(kind: TvFocusKind): TvFocusStyleResult {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => {
    setFocused(true);
  }, []);
  const onBlur = useCallback(() => {
    setFocused(false);
  }, []);
  // card 态：焦点切换经 state 依赖触发 worklet 重算，withTiming 驱动缩放动效；
  // row 态恒 1（不缩放，防列表抖动）
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: withTiming(
            kind === 'card' && focused ? TV_FOCUS_SCALE : 1,
            { duration: TV_FOCUS_TIMING_MS, easing: Easing.out(Easing.ease) }
          ),
        },
      ],
    }),
    [focused, kind]
  );
  return { focused, onFocus, onBlur, animatedStyle };
}
