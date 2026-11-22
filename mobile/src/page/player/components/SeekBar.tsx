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
import { StyleSheet, Text, View } from 'react-native';

interface SeekBarProps {
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** 拖动中预览（页面更新气泡 HUD） */
  onPreview: (positionMs: number) => void;
  /** 松手/点按提交 seek */
  onSeek: (positionMs: number) => void;
  /** 轨道配色（默认沉浸白；无封面主题玻璃页传主题色，避免浅底白轨不可见） */
  palette?: SeekBarPalette;
  /** AB 循环区间标记（圆环 + 字母，落在对应时间位置；不拦截手势） */
  markers?: { label: string; positionMs: number }[];
}

/** 进度条四层配色（播放页默认白；NowPlaying 主题玻璃页传主题 token） */
export interface SeekBarPalette {
  /** 已播轨道 */
  played: string;
  /** 缓冲轨道 */
  buffered: string;
  /** 底轨 */
  base: string;
  /** 拖动圆点 */
  thumb: string;
}

const DEFAULT_PALETTE: SeekBarPalette = {
  played: '#FFFFFF',
  buffered: 'rgba(255,255,255,0.6)',
  base: 'rgba(255,255,255,0.25)',
  thumb: '#FFFFFF',
};

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 14;
const BAR_HEIGHT = 32;
/** AB 标记圆环直径（大于拖动圆点，参考图口径） */
const MARKER_SIZE = 22;
/** AB 标记字母字号 */
const MARKER_FONT_SIZE = 11;

export function SeekBar({
  positionMs,
  bufferedMs,
  durationMs,
  onPreview,
  onSeek,
  palette,
  markers,
}: SeekBarProps) {
  const trackPalette = palette ?? DEFAULT_PALETTE;
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
          {/* 三层轨道：底轨 / 缓冲 / 已播（配色随页面 tone，播放页默认白） */}
          <View style={[styles.trackBase, { backgroundColor: trackPalette.base }]} />
          <View
            style={[
              styles.trackBuffered,
              { width: `${bufferedRatio * 100}%`, backgroundColor: trackPalette.buffered },
            ]}
          />
          <View
            style={[
              styles.trackPlayed,
              { width: `${playedRatio * 100}%`, backgroundColor: trackPalette.played },
            ]}
          />
        </View>
        <View
          style={[
            styles.thumb,
            { left: `${playedRatio * 100}%`, backgroundColor: trackPalette.thumb },
          ]}
        />
        {/* AB 循环标记：圆环取已播色（主题色），字母同色；不拦截手势，拖动/点按不受影响 */}
        {(markers ?? []).map((marker) => {
          const ratio = durationMs > 0 ? Math.min(1, Math.max(0, marker.positionMs / durationMs)) : 0;
          return (
            <View
              key={marker.label}
              pointerEvents="none"
              style={[
                styles.marker,
                { left: `${ratio * 100}%`, borderColor: trackPalette.played },
              ]}
            >
              <Text style={[styles.markerText, { color: trackPalette.played }]}>{marker.label}</Text>
            </View>
          );
        })}
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
  },
  trackBuffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  trackPlayed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    top: (BAR_HEIGHT - THUMB_SIZE) / 2,
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 2,
    marginLeft: -MARKER_SIZE / 2,
    top: (BAR_HEIGHT - MARKER_SIZE) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  markerText: { fontSize: MARKER_FONT_SIZE, fontWeight: '700' },
});
