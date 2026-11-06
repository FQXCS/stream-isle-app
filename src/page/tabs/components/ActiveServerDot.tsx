/**
 * 当前服务器指示点：核心点轻微呼吸 + 外扩光环，提示「正在使用」。
 * 8×8 外层参与布局（alignSelf: flex-start，让上/右边距都等于卡片内边距），
 * 光环只做 scale / opacity，不参与布局，不会撑开卡片。
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/component/useTheme';

const DOT_SIZE = 8;
const PULSE_DURATION = 1800;

export function ActiveServerDot() {
  const t = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_DURATION, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
  }, [progress]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.42 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 1.6 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.sin(progress.value * Math.PI) * 0.1 }],
  }));

  return (
    <View
      style={styles.wrap}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.halo, { backgroundColor: t.accent }, haloStyle]} />
      <Animated.View style={[styles.core, { backgroundColor: t.accent }, coreStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  halo: { position: 'absolute', width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  core: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
});
