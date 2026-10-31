/**
 * 进度条（M2 文档 §4.12 SeekBar）：reanimated 自绘三层轨道（已播白 / 缓冲 60% 白 /
 * 底轨 25% 白），支持点按与拖动；拖动中仅更新预览气泡（与全屏 seek 同规则），松手才 seek。
 * 不引第三方 slider。
 */
/* eslint-disable react-hooks/refs -- worklet 回调内经 ref.current 在手势线程暂存预览值，
   React Compiler 静态规则将手势回调误判为 render 期访问（运行时由 worklet 语义保证） */
import { useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

interface SeekBarProps {
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** 拖动中预览（页面更新气泡 HUD） */
  onPreview: (positionMs: number) => void;
  /** 松手/点按提交 seek */
  onSeek: (positionMs: number) => void;
}

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 14;
const BAR_HEIGHT = 32;

export function SeekBar({ positionMs, bufferedMs, durationMs, onPreview, onSeek }: SeekBarProps) {
  // 拖动中的预览值（松手前不动真实进度）
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const previewRef = useRef(0);
  // 条宽经 onLayout 写入 shared value（worklet 内换算比例用）
  const barWidthSV = useSharedValue(0);

  /** 按 x/宽度比例换算目标位置（worklet 与 Tap 回调共用，durationMs 经闭包捕获可序列化） */
  const targetOf = (eventX: number): number => {
    'worklet';
    const width = barWidthSV.value;
    const ratio = width > 0 ? Math.min(1, Math.max(0, eventX / width)) : 0;
    return ratio * durationMs;
  };

  const pan = Gesture.Pan()
    .onBegin((event) => {
      'worklet';
      previewRef.current = targetOf(event.x);
      runOnJS(setPreviewMs)(previewRef.current);
      runOnJS(onPreview)(previewRef.current);
    })
    .onUpdate((event) => {
      'worklet';
      previewRef.current = targetOf(event.x);
      runOnJS(setPreviewMs)(previewRef.current);
      runOnJS(onPreview)(previewRef.current);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(onSeek)(previewRef.current);
      runOnJS(setPreviewMs)(null);
    })
    // 兜底清理：无移动的轻触只触发 onBegin 不激活 Pan（onEnd 不回调），预览值会冻结进度条；
    // onFinalize 在激活成功/失败/取消时都会执行，确保 previewMs 复位（与 onEnd 清理幂等）
    .onFinalize(() => {
      'worklet';
      runOnJS(setPreviewMs)(null);
    });

  // 点按：直接 seek 到点击位置
  const tap = Gesture.Tap().onEnd((event, success) => {
    'worklet';
    if (success) {
      runOnJS(onSeek)(targetOf(event.x));
    }
  });

  const shownMs = previewMs ?? positionMs;
  const playedRatio = durationMs > 0 ? shownMs / durationMs : 0;
  const bufferedRatio = durationMs > 0 ? Math.min(1, bufferedMs / durationMs) : 0;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(tap, pan)}>
      <View
        style={styles.container}
        onLayout={(event) => {
          barWidthSV.value = event.nativeEvent.layout.width;
        }}
      >
        <View style={styles.trackWrap}>
          {/* 三层轨道：底轨 25% 白 / 缓冲 60% 白 / 已播白（02 §4.12） */}
          <View style={styles.trackBase} />
          <View style={[styles.trackBuffered, { width: `${bufferedRatio * 100}%` }]} />
          <View style={[styles.trackPlayed, { width: `${playedRatio * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${playedRatio * 100}%` }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    height: BAR_HEIGHT,
  },
  trackWrap: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  trackBase: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  trackBuffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  trackPlayed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    marginLeft: -THUMB_SIZE / 2,
    top: (BAR_HEIGHT - THUMB_SIZE) / 2,
  },
});
