/**
 * 歌词区「视频式」拖动 seek（M5 文档 §4.10，对齐 M2 §4.12 播放页 GestureLayer）：
 * 水平拖：拖动中只更新 HUD 预览气泡（起点位置 + dx/区域宽 × SEEK_FULL_WIDTH_SECONDS），
 * 松手才提交 seek；垂直拖 failOffset 交还给歌词列表滚动（轴互斥阈值与播放页同为 12dp）。
 * HUD 复用播放页 GestureHud（时间 + 增减量同款文案），在歌词区居中显示。
 */
/* eslint-disable react-hooks/refs -- 手势回调由 gesture-handler 在触摸事件中调用（非 render 期），
   ref 仅用于跨手势回调暂存宽度/起点/目标位置；React Compiler 静态规则无法识别该运行时语义
   （与 SeekBar 的 worklet 预览值同款豁免） */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

import { SEEK_FULL_WIDTH_SECONDS } from '@/constant/playback';
import { GestureHud, type HudState } from '@/page/player/components/GestureHud';

/** 水平/垂直手势互斥激活阈值（dp，与播放页 GestureLayer 同口径） */
const AXIS_FAIL_OFFSET = 12;

interface SeekDragAreaProps {
  /** 拖动起点位置（进度流每秒刷新，onBegin 时快照） */
  positionMs: number;
  durationMs: number;
  /** 松手提交 seek */
  onSeek: (positionMs: number) => void;
  children: ReactNode;
}

export function SeekDragArea({ positionMs, durationMs, onSeek, children }: SeekDragAreaProps) {
  const [hud, setHud] = useState<HudState | null>(null);
  /** 区域宽度（onLayout 写入，dx → 时间换算用） */
  const widthRef = useRef(0);
  const startMsRef = useRef(0);
  const targetMsRef = useRef(0);
  const positionRef = useRef(positionMs);
  const durationRef = useRef(durationMs);

  // 进度/时长经 effect 同步进 ref：手势回调读取最新快照，避免手势创建时的闭包过期
  useEffect(() => {
    positionRef.current = positionMs;
  }, [positionMs]);
  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  /** 手势开始：快照起点（拖动中进度条本身不动） */
  const handleBegin = useCallback(() => {
    startMsRef.current = positionRef.current;
    targetMsRef.current = positionRef.current;
  }, []);

  /** 拖动中：仅更新预览气泡，不真 seek */
  const handleUpdate = useCallback((dx: number) => {
    const width = widthRef.current;
    const duration = durationRef.current;
    if (width <= 0 || duration <= 0) {
      return;
    }
    const deltaMs = (dx / width) * SEEK_FULL_WIDTH_SECONDS * 1000;
    const target = Math.min(duration, Math.max(0, startMsRef.current + deltaMs));
    targetMsRef.current = target;
    setHud({ kind: 'seek', value: target, deltaMs: target - startMsRef.current });
  }, []);

  /** 松手提交 seek（手势取消时由 resetHud 兜底清理） */
  const handleEnd = useCallback(() => {
    if (widthRef.current > 0 && durationRef.current > 0) {
      onSeek(targetMsRef.current);
    }
  }, [onSeek]);

  const resetHud = useCallback(() => {
    setHud(null);
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-AXIS_FAIL_OFFSET, AXIS_FAIL_OFFSET])
    .failOffsetY([-AXIS_FAIL_OFFSET, AXIS_FAIL_OFFSET])
    .onBegin(() => {
      'worklet';
      runOnJS(handleBegin)();
    })
    .onUpdate((event) => {
      'worklet';
      runOnJS(handleUpdate)(event.translationX);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(handleEnd)();
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(resetHud)();
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.fill}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
        }}
      >
        {/* 拖动中歌词淡出，HUD 预览不被歌词文字干扰（children 元素引用稳定，不触发列表重渲染） */}
        <View style={[styles.fill, hud !== null && styles.lyricsDimmed]}>{children}</View>
        <GestureHud hud={hud} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lyricsDimmed: { opacity: 0.2 },
});
