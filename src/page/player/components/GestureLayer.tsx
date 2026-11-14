/**
 * 手势层（M2 文档 §4.12 手势表）：reanimated + gesture-handler。
 * 单击切换控制层（锁屏时仅呼出解锁）；左半屏垂直拖亮度、右半屏垂直拖音量
 * （onBegin 按 x 分流）；水平拖 seek（拖动中仅更新预览气泡、松手才 seek）。
 * 手势回调为 worklet：数值经组件内 shared value 传递、UI 动作经 runOnJS 回主线程。
 */
/* eslint-disable react-hooks/immutability -- reanimated worklet 经 shared value .value 跨线程
   传递状态，React Compiler 静态规则不识别该模式（运行时正确性由 babel-plugin-worklets 保证） */
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

/** 水平/垂直手势互斥激活阈值（dp，M2 §4.12 failOffset ±10dp） */
const AXIS_FAIL_OFFSET = 12;

interface GestureLayerProps {
  /** 锁屏：屏蔽全部手势，仅保留单击（呼出解锁按钮） */
  isLocked: boolean;
  /** 屏幕尺寸（全屏 seek 灵敏度与左右分流换算用） */
  screenWidth: number;
  screenHeight: number;
  /** 亮度/音量当前值（PlayerScreen 挂载时读原生写入 shared value，worklet 内读写） */
  brightnessSV: SharedValue<number>;
  volumeSV: SharedValue<number>;
  /** seek 起点（onBegin 时由 JS 侧从 playerStore 读入）与拖动目标 */
  seekStartMsSV: SharedValue<number>;
  seekTargetMsSV: SharedValue<number>;
  /** seek 时长上限（clamp 用） */
  durationMs: number;
  /** 全屏宽拖动对应的最大秒数（常量穿透 worklet） */
  seekFullWidthSeconds: number;
  onTap: () => void;
  /** 亮度/音量变化（JS 侧：set 原生 + HUD 更新） */
  onGestureValueChange: (side: 'left' | 'right', value: number) => void;
  /** 亮度/音量手势结束（HUD 延迟隐藏） */
  onGestureEnd: () => void;
  /** seek 手势开始（JS 侧读 playerStore.positionMs 写 seekStartMsSV） */
  onSeekBegin: () => void;
  /** 拖动中预览（仅更新气泡，不真 seek） */
  onSeekPreview: (positionMs: number) => void;
  /** 松手提交 seek */
  onSeekCommit: (positionMs: number) => void;
}

export function GestureLayer(props: GestureLayerProps) {
  const {
    isLocked,
    screenWidth,
    screenHeight,
    brightnessSV,
    volumeSV,
    seekStartMsSV,
    seekTargetMsSV,
    durationMs,
    seekFullWidthSeconds,
    onTap,
    onGestureValueChange,
    onGestureEnd,
    onSeekBegin,
    onSeekPreview,
    onSeekCommit,
  } = props;

  // 手势内部状态（worklet 专用）
  const verticalSideSV = useSharedValue<'left' | 'right'>('left');
  const verticalStartYSV = useSharedValue(0);
  const verticalStartValueSV = useSharedValue(0);
  const horizontalStartXSV = useSharedValue(0);

  // Tap 默认不限制位移（Android maxDist=MAX_VALUE_IGNORE），快速滑动会被同时识别成
  // 单击而误呼出控制层；显式限制在与拖动激活同一阈值内，保证「拖动即非单击」
  const tap = Gesture.Tap()
    .maxDistance(AXIS_FAIL_OFFSET)
    .onEnd((_event, success) => {
      'worklet';
      if (success) {
        runOnJS(onTap)();
      }
    });

  // 垂直拖：onBegin 按 x 分流左（亮度）/右（音量），onUpdate 按 dy/屏高线性映射 0..1
  const verticalPan = Gesture.Pan()
    .activeOffsetY([-AXIS_FAIL_OFFSET, AXIS_FAIL_OFFSET])
    .failOffsetX([-AXIS_FAIL_OFFSET, AXIS_FAIL_OFFSET])
    .onBegin((event) => {
      'worklet';
      verticalSideSV.value = event.x < screenWidth / 2 ? 'left' : 'right';
      verticalStartYSV.value = event.absoluteY;
      verticalStartValueSV.value =
        verticalSideSV.value === 'left' ? brightnessSV.value : volumeSV.value;
    })
    .onUpdate((event) => {
      'worklet';
      const delta = (verticalStartYSV.value - event.absoluteY) / screenHeight;
      const value = Math.min(1, Math.max(0, verticalStartValueSV.value + delta));
      const side = verticalSideSV.value;
      if (side === 'left') {
        brightnessSV.value = value;
      } else {
        volumeSV.value = value;
      }
      runOnJS(onGestureValueChange)(side, value);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(onGestureEnd)();
    });

  // 水平拖：拖动中仅更新预览气泡（起点 positionMs + dx/屏宽 × SEEK_FULL_WIDTH_SECONDS），松手才 seek
  const horizontalPan = Gesture.Pan()
    .activeOffsetX([-AXIS_FAIL_OFFSET, AXIS_FAIL_OFFSET])
    .failOffsetY([-AXIS_FAIL_OFFSET, AXIS_FAIL_OFFSET])
    .onBegin((event) => {
      'worklet';
      horizontalStartXSV.value = event.absoluteX;
      // 起点位置由 JS 侧读 store（playerStore.positionMs）写入 seekStartMsSV；
      // 首帧 onUpdate 与回写存在微小竞态窗口（runOnJS 派发延迟），对预览气泡无感知
      runOnJS(onSeekBegin)();
    })
    .onUpdate((event) => {
      'worklet';
      const deltaMs =
        ((event.absoluteX - horizontalStartXSV.value) / screenWidth) *
        seekFullWidthSeconds *
        1000;
      const target = Math.min(durationMs, Math.max(0, seekStartMsSV.value + deltaMs));
      seekTargetMsSV.value = target;
      runOnJS(onSeekPreview)(target);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(onSeekCommit)(seekTargetMsSV.value);
    });

  // 互斥激活：activeOffset/failOffset 保证垂直与水平手势不同时命中（M2 §7 手势误触对策）；
  // Race 让单击与拖动互斥——拖动激活即取消单击，单击成立即取消拖动（避免一次触摸双动作）；
  // 控制层可见时拖动依然可用（SeekBar/按钮等实际控件在自己范围内命中，不会落到本层）；
  // 锁屏时仅保留单击
  const gesture = isLocked ? tap : Gesture.Race(tap, Gesture.Exclusive(horizontalPan, verticalPan));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
