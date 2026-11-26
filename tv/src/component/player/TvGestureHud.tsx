/**
 * TV 播放 HUD（TV-m3 §4.2/§4.3，照抄手机 GestureHud 契约的 TV 子集）：
 * 遥控 seek 预览时间气泡（控制层隐藏时 ←→ / SeekBar 聚焦步进共用）。
 * TV 无亮度/音量手势与双击手势，对应 kind 不移植；沉浸页固定 COLORS 深色口径。
 */
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { formatClock } from '@/util/format';

/** HUD 状态（页面在 seek 按键回调中维护） */
export interface TvHudState {
  kind: 'seek';
  /** 目标位置毫秒 */
  value: number;
  /** 相对当前进度的增量毫秒（正负号显示） */
  deltaMs?: number;
}

interface TvGestureHudProps {
  hud: TvHudState | null;
}

export function TvGestureHud({ hud }: TvGestureHudProps) {
  const tr = useT();
  if (hud === null) {
    return null;
  }
  const deltaMs = hud.deltaMs ?? 0;
  const sign = deltaMs >= 0 ? '+' : '-';
  const text = tr('player.hudSeek', {
    delta: `${sign}${formatClock(Math.abs(deltaMs))}`,
    position: formatClock(hud.value),
  });
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.bubble}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: COLORS.posterRadius,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
  },
  text: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
});