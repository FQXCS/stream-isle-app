/**
 * 手势浮层（M2 文档 §4.1 GestureHud）：亮度/音量百分比气泡、seek 预览时间气泡。
 * 拖动中显示、手势结束后由页面延迟隐藏。
 */
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { formatClock } from '@/util/format';

/** HUD 状态（页面在手势回调中维护） */
export interface HudState {
  kind: 'brightness' | 'volume' | 'seek';
  /** brightness/volume：0..1；seek：目标位置毫秒 */
  value: number;
  /** seek 专用：相对拖动起点的增量毫秒（正负号显示） */
  deltaMs?: number;
}

interface GestureHudProps {
  hud: HudState | null;
}

export function GestureHud({ hud }: GestureHudProps) {
  if (hud === null) {
    return null;
  }
  let text: string;
  let icon: AppIconName | null = null;
  if (hud.kind === 'seek') {
    const deltaMs = hud.deltaMs ?? 0;
    const sign = deltaMs >= 0 ? '+' : '-';
    text = `${sign}${formatClock(Math.abs(deltaMs))}（${formatClock(hud.value)}）`;
  } else if (hud.kind === 'brightness') {
    icon = 'brightness';
    text = `${Math.round(hud.value * 100)}%`;
  } else {
    icon = 'volume';
    text = `${Math.round(hud.value * 100)}%`;
  }
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.bubble}>
        {icon !== null ? (
          <View style={styles.row}>
            <AppIcon name={icon} size={16} color={COLORS.textPrimary} />
            <Text style={styles.text}>{text}</Text>
          </View>
        ) : (
          <Text style={styles.text}>{text}</Text>
        )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  text: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
});
