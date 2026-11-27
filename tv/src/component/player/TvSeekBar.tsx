/**
 * TV 进度条（TV-m3 §4.3，照抄手机 SeekBar 契约的 TV 改造）：三层轨道（已播/缓冲/底轨）
 * + 拖动圆点。去手机 Pan/Tap 手势——TV 由 TvKeyLayer 统一处理 ←→ 步进
 * （聚焦本条时 ±10s，页面 seekBy 驱动，上下文经 onFocus/onBlur 上抛布尔态判定）。
 * nextFocusLeft/Right 自环（自身 tag）使 ←→ 步进时原生焦点搜索留在本条（不跳去播放键）。
 * 焦点态 row 背景高亮（TvPressable 收口）。
 */
import { useState } from 'react';
import type { FocusEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { useImmersiveAccent } from '@/component/useTheme';
import { formatClock } from '@/util/format';

import { TvPressable } from '@tv/component/TvPressable';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvSeekBarProps {
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** 焦点进出透传（控制层焦点计数挂起自动隐藏 + SeekBar 焦点态上抛） */
  onFocus?(event: FocusEvent): void;
  onBlur?(event: FocusEvent): void;
}

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 14;
const BAR_HEIGHT = 36;

export function TvSeekBar({
  positionMs,
  bufferedMs,
  durationMs,
  onFocus,
  onBlur,
}: TvSeekBarProps) {
  const { accent } = useImmersiveAccent();
  // 自身 tag（nextFocusLeft/Right 自环目标，使 ←→ 步进时焦点留在本条）
  const [selfTag, setSelfTag] = useState<number | null>(null);

  const playedRatio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const bufferedRatio = durationMs > 0 ? Math.min(1, bufferedMs / durationMs) : 0;

  return (
    <TvPressable
      focusKind="row"
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel={`${formatClock(positionMs)} / ${formatClock(durationMs)}`}
      style={styles.container}
      nextFocusLeft={selfTag ?? undefined}
      nextFocusRight={selfTag ?? undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      ref={(ref) => setSelfTag(findNodeHandleTagOf(ref))}
    >
      <View style={styles.trackWrap}>
        {/* 三层轨道：底轨 / 缓冲 / 已播（沉浸白 + 主题色已播，手机播放页同口径） */}
        <View style={[styles.trackBase, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
        <View
          style={[
            styles.trackBuffered,
            { width: `${bufferedRatio * 100}%`, backgroundColor: 'rgba(255,255,255,0.6)' },
          ]}
        />
        <View
          style={[
            styles.trackPlayed,
            { width: `${playedRatio * 100}%`, backgroundColor: accent },
          ]}
        />
      </View>
      <View
        style={[
          styles.thumb,
          { left: `${playedRatio * 100}%`, backgroundColor: '#FFFFFF' },
        ]}
      />
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    height: BAR_HEIGHT,
    borderRadius: 8,
    paddingHorizontal: 4,
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
});