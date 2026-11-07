/**
 * 控制层（参考图重构）：顶部（返回 + 标题 + 四点更多）；中部左竖排（锁屏 + 画中画）、
 * 右竖排（AB 循环 + 截图）；底部（圆形播放/暂停 + 全宽 SeekBar + 旋转屏幕，
 * 次行两端当前时长 / 总时长）。透明底不遮画面；无操作 CONTROLS_AUTO_HIDE_MS 自动隐藏。
 * 字幕/音轨/分辨率入口收进右上更多菜单（PlayerMoreMenu）。
 * 按钮统一 OverlayButton（RNGH Tap），与手势层同命中链路。
 */
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SeekBar } from '@/page/player/components/SeekBar';
import { OverlayButton } from '@/page/player/components/OverlayButton';
import { CONTROLS_AUTO_HIDE_MS } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useImmersiveAccent } from '@/component/useTheme';
import { useT } from '@/i18n';
import { formatClock } from '@/util/format';
import { usePlayerStore } from '@/store/playerStore';

/** 圆形播放键直径（时间行缩进与其对齐） */
const PLAY_BUTTON_SIZE = 48;
/** 旋转按钮占位宽（时间行右缩进与其对齐） */
const ROTATE_BUTTON_SIZE = 48;

interface ControlOverlayProps {
  /** 「标题 · S1E2 集名」（详情页拼好随会话传入） */
  title: string;
  isPlaying: boolean;
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** AB 循环态：none=未设 / a=仅 A 点 / active=区间循环中（图标高亮） */
  abLoopState: 'none' | 'a' | 'active';
  onExit: () => void;
  onToggleLock: () => void;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void;
  onOpenMoreMenu: () => void;
  onEnterPip: () => void;
  onAbLoop: () => void;
  onSnapshot: () => void;
  onRotate: () => void;
}

export function ControlOverlay({
  title,
  isPlaying,
  positionMs,
  bufferedMs,
  durationMs,
  abLoopState,
  onExit,
  onToggleLock,
  onTogglePlay,
  onSeek,
  onOpenMoreMenu,
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

  const abActive = abLoopState !== 'none';

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* 顶部：返回 + 标题 + 更多 */}
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
        <OverlayButton
          icon="moreGrid"
          label={tr('player.moreMenu')}
          color={COLORS.textPrimary}
          onPress={interact(onOpenMoreMenu)}
        />
      </View>
      {/* 中部：左竖排（锁屏+画中画）/ 右竖排（AB+截图）；空白处点击穿透到手势层 */}
      <View style={styles.middleRow} pointerEvents="box-none">
        <View style={styles.railColumn}>
          <OverlayButton
            icon="lock"
            label={tr('player.lockScreen')}
            color={COLORS.textPrimary}
            onPress={interact(onToggleLock)}
          />
          <OverlayButton
            icon="pip"
            label={tr('player.pip')}
            color={COLORS.textPrimary}
            onPress={interact(onEnterPip)}
          />
        </View>
        <View style={styles.railColumn}>
          <OverlayButton
            icon="abLoop"
            label={tr('player.abLoop')}
            color={abActive ? accent : COLORS.textPrimary}
            onPress={interact(onAbLoop)}
          />
          <OverlayButton
            icon="snapshot"
            label={tr('player.snapshot')}
            color={COLORS.textPrimary}
            onPress={interact(onSnapshot)}
          />
        </View>
      </View>
      {/* 底部：圆形播放键 + 进度条 + 旋转；次行两端时间 */}
      <View style={styles.bottomBar} pointerEvents="box-none">
        <View style={styles.playRow} pointerEvents="box-none">
          <OverlayButton
            icon={isPlaying ? 'pause' : 'play'}
            label={isPlaying ? tr('player.pause') : tr('player.play')}
            color={COLORS.textPrimary}
            onPress={interact(onTogglePlay)}
            style={styles.playButton}
          />
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
            onPreview={scheduleHide}
            onSeek={(targetMs) => {
              onSeek(targetMs);
              scheduleHide();
            }}
          />
          <OverlayButton
            icon="rotate"
            label={tr('player.rotate')}
            color={COLORS.textPrimary}
            onPress={interact(onRotate)}
            style={styles.rotateButton}
          />
        </View>
        <View style={styles.timeRow} pointerEvents="none">
          <Text style={styles.time}>{formatClock(positionMs)}</Text>
          <View style={styles.flexSpacer} />
          <Text style={styles.time}>{formatClock(durationMs)}</Text>
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
  middleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
  },
  railColumn: {
    alignItems: 'center',
    gap: SPACING.xl,
  },
  bottomBar: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.m,
    gap: SPACING.xs,
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
  rotateButton: {
    width: ROTATE_BUTTON_SIZE,
    height: ROTATE_BUTTON_SIZE,
    padding: 0,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PLAY_BUTTON_SIZE + SPACING.m,
    marginRight: ROTATE_BUTTON_SIZE + SPACING.m,
  },
  flexSpacer: { flex: 1 },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZE.title,
    fontWeight: '600',
    flex: 1,
  },
  time: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});