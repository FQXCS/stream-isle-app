/**
 * 控制层（参考图竖屏口径重排）：顶栏左返回+标题、右横排（锁屏/截图/更多）；
 * 底部半透明圆角面板：进度行（圆形播放键 + 当前时长 + SeekBar + 总时长）+
 * 工具横排（旋转 / 倍速 / AB 循环 / 画中画）。字幕/音轨/分辨率收进更多菜单。
 * 无操作 CONTROLS_AUTO_HIDE_MS 自动隐藏；按钮统一 OverlayButton（RNGH Tap）。
 */
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SeekBar } from '@/page/player/components/SeekBar';
import { OverlayButton } from '@/page/player/components/OverlayButton';
import { CONTROLS_AUTO_HIDE_MS } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useImmersiveAccent } from '@/component/useTheme';
import { useT } from '@/i18n';
import { formatClock, formatPlaybackSpeed } from '@/util/format';
import type { AbLoop } from '@/util/abLoop';
import { usePlayerStore } from '@/store/playerStore';

/** 圆形播放键直径 */
const PLAY_BUTTON_SIZE = 40;
/** 面板圆角（参考图顶部圆角口径） */
const PANEL_RADIUS = 20;
/** 工具横排图标尺寸 */
const TOOL_ICON_SIZE = 26;

interface ControlOverlayProps {
  /** 「标题 · S1E2 集名」（详情页拼好随会话传入） */
  title: string;
  isPlaying: boolean;
  isLocked: boolean;
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** AB 循环区间（null=未设；bMs=null=仅 A 点）：驱动图标三态与进度条 A/B 标记 */
  abLoop: AbLoop | null;
  playbackSpeed: number;
  onExit: () => void;
  onToggleLock: () => void;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void;
  onOpenMoreMenu: () => void;
  onOpenSpeedMenu: () => void;
  onEnterPip: () => void;
  onAbLoop: () => void;
  onSnapshot: () => void;
  onRotate: () => void;
}

export function ControlOverlay({
  title,
  isPlaying,
  isLocked,
  positionMs,
  bufferedMs,
  durationMs,
  abLoop,
  playbackSpeed,
  onExit,
  onToggleLock,
  onTogglePlay,
  onSeek,
  onOpenMoreMenu,
  onOpenSpeedMenu,
  onEnterPip,
  onAbLoop,
  onSnapshot,
  onRotate,
}: ControlOverlayProps) {
  // 无操作自动隐藏（CONTROLS_AUTO_HIDE_MS）：挂载即计时，交互（按钮/拖动）重置；
  // 控制层显隐由页面 toggleControls 驱动，本组件不持有 visible 状态
  const tr = useT();
  const { accent } = useImmersiveAccent();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      // 隐藏控制层（与页面单击切换同一 store 入口）
      usePlayerStore.getState().setControlsVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, [clearTimer]);

  useEffect(() => {
    scheduleHide();
    return clearTimer;
  }, [scheduleHide, clearTimer]);

  /** 交互包装：执行动作并重置自动隐藏计时 */
  const interact = (action: () => void) => () => {
    action();
    scheduleHide();
  };

  const abActive = abLoop !== null;
  // 图标三态：未设=白 AB；仅 A=主题色单 A；循环中=主题色 AB（参考图口径）
  const abIcon = abLoop !== null && abLoop.bMs === null ? 'abLoopA' : 'abLoop';
  const abMarkers =
    abLoop === null
      ? []
      : abLoop.bMs === null
        ? [{ label: 'A', positionMs: abLoop.aMs }]
        : [
            { label: 'A', positionMs: abLoop.aMs },
            { label: 'B', positionMs: abLoop.bMs },
          ];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* 顶栏：左返回+标题；右横排 锁屏/截图/更多（参考图口径） */}
      <View style={styles.topBar} pointerEvents="box-none">
        <OverlayButton
          icon="arrowLeft"
          label={tr('nav.back')}
          color={COLORS.textPrimary}
          onPress={interact(onExit)}
        />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.topActions} pointerEvents="box-none">
          <OverlayButton
            icon={isLocked ? 'lock' : 'unlock'}
            label={isLocked ? tr('player.unlock') : tr('player.lockScreen')}
            color={COLORS.textPrimary}
            onPress={interact(onToggleLock)}
            iconSize={TOOL_ICON_SIZE}
          />
          <OverlayButton
            icon="snapshot"
            label={tr('player.snapshot')}
            color={COLORS.textPrimary}
            onPress={interact(onSnapshot)}
            iconSize={TOOL_ICON_SIZE}
          />
          <OverlayButton
            icon="moreGrid"
            label={tr('player.moreMenu')}
            color={COLORS.textPrimary}
            onPress={interact(onOpenMoreMenu)}
            iconSize={TOOL_ICON_SIZE}
          />
        </View>
      </View>
      {/* 中部留白：点击穿透到手势层（单击切换控制层/拖动 seek/亮度音量） */}
      <View style={styles.flexSpacer} pointerEvents="none" />
      {/* 底部半透明圆角面板：进度行 + 工具横排 */}
      <View style={styles.panel} pointerEvents="box-none">
        <View style={styles.playRow} pointerEvents="box-none">
          <OverlayButton
            icon={isPlaying ? 'pause' : 'play'}
            label={isPlaying ? tr('player.pause') : tr('player.play')}
            color={COLORS.textPrimary}
            onPress={interact(onTogglePlay)}
            style={styles.playButton}
          />
          <Text style={styles.time}>{formatClock(positionMs)}</Text>
          <SeekBar
            positionMs={positionMs}
            bufferedMs={bufferedMs}
            durationMs={durationMs}
            palette={{
              played: accent,
              buffered: 'rgba(255,255,255,0.6)',
              base: 'rgba(255,255,255,0.25)',
              thumb: '#FFFFFF',
            }}
            markers={abMarkers}
            onPreview={scheduleHide}
            onSeek={(targetMs) => {
              onSeek(targetMs);
              scheduleHide();
            }}
          />
          <Text style={styles.time}>{formatClock(durationMs)}</Text>
        </View>
        <View style={styles.toolRow} pointerEvents="box-none">
          <OverlayButton
            text={formatPlaybackSpeed(playbackSpeed)}
            label={tr('player.speedMenu')}
            color={COLORS.textPrimary}
            onPress={interact(onOpenSpeedMenu)}
          />
          <OverlayButton
            icon={abIcon}
            label={tr('player.abLoop')}
            color={abActive ? accent : COLORS.textPrimary}
            onPress={interact(onAbLoop)}
            iconSize={TOOL_ICON_SIZE}
          />
          <OverlayButton
            icon="pip"
            label={tr('player.pip')}
            color={COLORS.textPrimary}
            onPress={interact(onEnterPip)}
            iconSize={TOOL_ICON_SIZE}
          />
          <OverlayButton
            icon="rotate"
            label={tr('player.rotate')}
            color={COLORS.textPrimary}
            onPress={interact(onRotate)}
            iconSize={TOOL_ICON_SIZE}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.l,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  flexSpacer: { flex: 1 },
  panel: {
    backgroundColor: 'rgba(16,16,20,0.72)',
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.m,
    gap: SPACING.s,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    padding: 0,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.xl,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZE.title,
    fontWeight: '600',
    flex: 1,
  },
  time: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});