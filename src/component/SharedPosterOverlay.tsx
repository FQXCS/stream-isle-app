/**
 * 根级共享元素浮层（M6 文档 §4.6.2；设计文档 §10.1 海报 → 详情共享元素转场）：
 * 挂在 NavigationContainer 同层；读到 transitionStore.active + 目标就绪后，用 reanimated
 * sharedValue 250ms 从 fromRect 飞至目标矩形，期间 Hero 真图延后淡入（HeroHeader 消费），
 * 完成 end()。测量失败/快速连点/目标未就绪——不挂浮层，退化为普通转场（功能不损）。
 * 仅做正向（海报墙 → 详情）单向转场；返回为普通转场（06 §4.6.2 边界决策）。
 * 快速连点：begin 覆盖 active（同 key 重挂载重启飞行），不叠加动画。
 */
import { useEffect } from 'react';
import { Image } from 'expo-image';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

import { POSTER_RADIUS } from '@/constant/theme';
import { useTransitionStore, type PosterTransition } from '@/store/transitionStore';

/** 飞行时长（250ms 单向短动画，06 文档 §4.6.2） */
const TRANSITION_DURATION_MS = 250;

export function SharedPosterOverlay() {
  const active = useTransitionStore((state) => state.active);
  const end = useTransitionStore((state) => state.end);

  // 兜底（06 §4.6.2）：目标未就绪（Hero 未完成测量）不挂浮层，退化为普通转场
  if (active === null || active.targetRect === null) {
    return null;
  }
  return <PosterFlight key={active.uri} transition={active} onDone={end} />;
}

/** 单次飞行（独立组件：hooks 仅在确认起飞后调用，规避条件 hooks） */
function PosterFlight({
  transition,
  onDone,
}: {
  transition: PosterTransition;
  onDone: () => void;
}) {
  const { uri, fromRect, targetRect } = transition;
  // SharedPosterOverlay 已保证 targetRect 非空；此处取局部别名供 worklet 闭包收窄
  const target = targetRect as NonNullable<PosterTransition['targetRect']>;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: TRANSITION_DURATION_MS },
      (finished) => {
        if (finished) {
          runOnJS(onDone)();
        }
      }
    );
    // 挂载即起飞一次（key 保证重挂载重启）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: fromRect.x + (target.x - fromRect.x) * p,
      top: fromRect.y + (target.y - fromRect.y) * p,
      width: fromRect.width + (target.width - fromRect.width) * p,
      height: fromRect.height + (target.height - fromRect.height) * p,
    };
  });

  return (
    <Animated.View style={[styles.overlay, animatedStyle]} pointerEvents="none">
      <Image source={{ uri }} style={styles.image} contentFit="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
    elevation: 12,
  },
  image: { width: '100%', height: '100%' },
});
