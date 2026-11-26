/**
 * TV 进度条（TV-m3 §4.3，照抄手机 SeekBar 契约的 TV 改造）：三层轨道（已播/缓冲/底轨）
 * + 拖动圆点 + AB 循环标记。去手机 Pan/Tap 手势——TV 由 TvKeyLayer 统一处理 ←→ 步进
 * （聚焦本条时 ±10s，页面 seekBy 驱动，上下文经 onFocus/onBlur 上抛布尔态判定）。
 * nextFocusLeft/Right 自环（自身 tag）使 ←→ 步进时原生焦点搜索留在本条（不跳去播放键）。
 * 焦点态 row 背景高亮（TvPressable 收口）。
 */
import { useState } from 'react';
import type { FocusEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useImmersiveAccent } from '@/component/useTheme';
import { formatClock } from '@/util/format';

import { TvPressable } from '@tv/component/TvPressable';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvSeekBarProps {
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** AB 循环区间标记（圆环 + 字母，落在对应时间位置） */
  markers?: { label: string; positionMs: number }[];
  /** 焦点进出透传（控制层焦点计数挂起自动隐藏 + SeekBar 焦点态上抛） */
  onFocus?(event: FocusEvent): void;
  onBlur?(event: FocusEvent): void;
}

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 14;
const BAR_HEIGHT = 36;
/** AB 标记圆环直径（大于拖动圆点，手机同口径） */
const MARKER_SIZE = 22;
const MARKER_FONT_SIZE = 11;

export function TvSeekBar({
  positionMs,
  bufferedMs,
  durationMs,
  markers,
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
      {/* AB 循环标记：圆环取已播色（主题色），字母同色 */}
      {(markers ?? []).map((marker) => {
        const ratio = durationMs > 0 ? Math.min(1, Math.max(0, marker.positionMs / durationMs)) : 0;
        return (
          <View
            key={marker.label}
            pointerEvents="none"
            style={[styles.marker, { left: `${ratio * 100}%`, borderColor: accent }]}
          >
            <Text style={[styles.markerText, { color: accent }]}>{marker.label}</Text>
          </View>
        );
      })}
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