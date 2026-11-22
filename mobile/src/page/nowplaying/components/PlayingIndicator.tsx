/**
 * 队列当前曲播放指示器：三条竖条上下起伏（各自周期/起始相位错开），
 * 暂停/缓冲时停止动画并静止在满高，替代原静态 equalizer 图标。
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/component/useTheme';
import { usePlayerStore } from '@/store/playerStore';

/** 竖条基础高度与单程时长（周期彼此错开，形成上下交替的律动） */
const BAR_LIST = [
  { height: 8, duration: 340 },
  { height: 14, duration: 520 },
  { height: 10, duration: 420 },
] as const;

/** 收缩到的最低比例（保留条底，形成上下跳动感） */
const MIN_SCALE = 0.3;
/** 相邻竖条的起始相位差（毫秒） */
const BAR_DELAY_MS = 90;

interface BarProps {
  height: number;
  duration: number;
  delay: number;
  playing: boolean;
  color: string;
}

function Bar({ height, duration, delay, playing, color }: BarProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 150 });
      return () => cancelAnimation(scale);
    }
    scale.value = withDelay(
      delay,
      withRepeat(withTiming(MIN_SCALE, { duration }), -1, true)
    );
    return () => cancelAnimation(scale);
  }, [playing, delay, duration, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.bar, { height, backgroundColor: color, transformOrigin: 'bottom' }, animatedStyle]}
    />
  );
}

export function PlayingIndicator() {
  const t = useTheme();
  const playing = usePlayerStore((state) => state.audio.status === 'playing');
  return (
    <View style={styles.container} accessible={false}>
      {BAR_LIST.map((bar, index) => (
        <Bar
          key={bar.height}
          height={bar.height}
          duration={bar.duration}
          delay={index * BAR_DELAY_MS}
          playing={playing}
          color={t.accent}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 18,
    height: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  bar: { width: 3, borderRadius: 1.5 },
});
