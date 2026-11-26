/**
 * TV 控制层（TV-m3 §4.3，照抄手机 ControlOverlay 契约的 TV 改造）：
 * 顶栏左返回 + 标题、右横排截图/更多；底部半透面板进度行（圆形播放键 + 当前时长 +
 * TvSeekBar + 总时长）+ 工具横排（倍速 / AB 循环）。去手机锁屏/旋转/画中画（TV 无意义）。
 * TV 改造：① 按钮全 TvPressable（焦点视觉收口）；② 自动隐藏改「焦点存在挂起」——
 * 焦点计数 >0 或菜单打开时不计时，焦点离开且无操作恢复 CONTROLS_AUTO_HIDE_MS 计时
 * （TV 自持逻辑，不改手机 ControlOverlay）；③ preferredFocus 驱动 hasTVPreferredFocus
 * 落点（呼出落播放键 / 菜单关闭回触发按钮，setter false→true 触发 requestFocus）；
 * ④ 顶栏焦点态上抛（TvKeyLayer DOWN 隐藏判定）；⑤ seek 由 TvKeyLayer 按键驱动，无 onSeek。
 */
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { useImmersiveAccent } from '@/component/useTheme';
import { CONTROLS_AUTO_HIDE_MS } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { usePlayerStore } from '@/store/playerStore';
import type { AbLoop } from '@/util/abLoop';
import { formatClock, formatPlaybackSpeed } from '@/util/format';

import { TvPressable } from '@tv/component/TvPressable';
import { TvSeekBar } from '@tv/component/player/TvSeekBar';

/** 圆形播放键直径（TV 10-foot 档，手机 40 放大） */
const PLAY_BUTTON_SIZE = 56;
/** 面板圆角（手机参考图口径） */
const PANEL_RADIUS = 20;
/** 工具横排图标尺寸（TV 控件档 28，设计 §10） */
const TOOL_ICON_SIZE = 28;

/** 焦点落点按钮（呼出=play；菜单关闭回触发按钮 more/speed） */
export type TvOverlayFocusTarget = 'play' | 'more' | 'speed';

interface TvControlOverlayProps {
  /** 「标题 · S1E2 集名」（详情页拼好随会话传入） */
  title: string;
  isPlaying: boolean;
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  /** AB 循环区间（null=未设；bMs=null=仅 A 点）：驱动图标三态与进度条 A/B 标记 */
  abLoop: AbLoop | null;
  playbackSpeed: number;
  /** hasTVPreferredFocus 落点按钮 */
  preferredFocus: TvOverlayFocusTarget;
  /** 菜单打开（自动隐藏计时挂起，防抽屉操作期间控制层收起） */
  menuOpen: boolean;
  onExit: () => void;
  onTogglePlay: () => void;
  onOpenMoreMenu: () => void;
  onOpenSpeedMenu: () => void;
  onAbLoop: () => void;
  onSnapshot: () => void;
  /** SeekBar 焦点态上抛（TvKeyLayer 步进上下文判定） */
  onSeekBarFocused: (focused: boolean) => void;
  /** 顶栏焦点态上抛（TvKeyLayer DOWN 隐藏判定） */
  onTopBarFocused: (focused: boolean) => void;
}

export function TvControlOverlay({
  title,
  isPlaying,
  positionMs,
  bufferedMs,
  durationMs,
  abLoop,
  playbackSpeed,
  preferredFocus,
  menuOpen,
  onExit,
  onTogglePlay,
  onOpenMoreMenu,
  onOpenSpeedMenu,
  onAbLoop,
  onSnapshot,
  onSeekBarFocused,
  onTopBarFocused,
}: TvControlOverlayProps) {
  const tr = useT();
  const { accent } = useImmersiveAccent();

  // —— 焦点存在挂起自动隐藏：焦点计数 >0 清计时；归零且无菜单恢复计时 ——
  const focusCountRef = useRef(0);
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
      usePlayerStore.getState().setControlsVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, [clearTimer]);
  const handleFocusIn = useCallback(() => {
    focusCountRef.current += 1;
    clearTimer();
  }, [clearTimer]);
  const handleFocusOut = useCallback(() => {
    focusCountRef.current = Math.max(0, focusCountRef.current - 1);
    if (focusCountRef.current === 0 && !menuOpen) {
      scheduleHide();
    }
  }, [menuOpen, scheduleHide]);
  // 菜单开合切换计时挂起（菜单打开焦点移入抽屉，控制层计数归零也不计时）
  useEffect(() => {
    if (menuOpen) {
      clearTimer();
    } else if (focusCountRef.current === 0) {
      scheduleHide();
    }
  }, [menuOpen, clearTimer, scheduleHide]);
  useEffect(() => clearTimer, [clearTimer]);

  const abActive = abLoop !== null;
  // 图标三态：未设=白 AB；仅 A=主题色单 A；循环中=主题色 AB（手机参考图口径）
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
      {/* 顶栏：左返回 + 标题；右横排 截图/更多（顶栏焦点态上抛供 DOWN 隐藏判定） */}
      <View style={styles.topBar} pointerEvents="box-none">
        <TvPressable
          focusKind="row"
          focusable
          accessibilityRole="button"
          accessibilityLabel={tr('nav.back')}
          onPress={onExit}
          onFocus={() => {
            handleFocusIn();
            onTopBarFocused(true);
          }}
          onBlur={() => {
            handleFocusOut();
            onTopBarFocused(false);
          }}
          style={styles.iconButton}
        >
          <AppIcon name="arrowLeft" size={TOOL_ICON_SIZE} color={COLORS.textPrimary} />
        </TvPressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.topActions} pointerEvents="box-none">
          <TvPressable
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={tr('player.snapshot')}
            onPress={onSnapshot}
            onFocus={() => {
              handleFocusIn();
              onTopBarFocused(true);
            }}
            onBlur={() => {
              handleFocusOut();
              onTopBarFocused(false);
            }}
            style={styles.iconButton}
          >
            <AppIcon name="snapshot" size={TOOL_ICON_SIZE} color={COLORS.textPrimary} />
          </TvPressable>
          <TvPressable
            focusKind="row"
            focusable
            hasTVPreferredFocus={preferredFocus === 'more'}
            accessibilityRole="button"
            accessibilityLabel={tr('player.moreMenu')}
            onPress={onOpenMoreMenu}
            onFocus={() => {
              handleFocusIn();
              onTopBarFocused(true);
            }}
            onBlur={() => {
              handleFocusOut();
              onTopBarFocused(false);
            }}
            style={styles.iconButton}
          >
            <AppIcon name="moreGrid" size={TOOL_ICON_SIZE} color={COLORS.textPrimary} />
          </TvPressable>
        </View>
      </View>
      {/* 中部留白（TV 无手势层，纯视觉间隔） */}
      <View style={styles.flexSpacer} pointerEvents="none" />
      {/* 底部半透圆角面板：进度行 + 工具横排 */}
      <View style={styles.panel} pointerEvents="box-none">
        <View style={styles.playRow} pointerEvents="box-none">
          <TvPressable
            focusKind="card"
            focusable
            hasTVPreferredFocus={preferredFocus === 'play'}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? tr('player.pause') : tr('player.play')}
            onPress={onTogglePlay}
            onFocus={handleFocusIn}
            onBlur={handleFocusOut}
            style={[styles.playButton, { backgroundColor: accent }]}
          >
            <AppIcon
              name={isPlaying ? 'pause' : 'play'}
              size={28}
              color={COLORS.textPrimary}
            />
          </TvPressable>
          <Text style={styles.time}>{formatClock(positionMs)}</Text>
          <TvSeekBar
            positionMs={positionMs}
            bufferedMs={bufferedMs}
            durationMs={durationMs}
            markers={abMarkers}
            onFocus={() => {
              handleFocusIn();
              onSeekBarFocused(true);
            }}
            onBlur={() => {
              handleFocusOut();
              onSeekBarFocused(false);
            }}
          />
          <Text style={styles.time}>{formatClock(durationMs)}</Text>
        </View>
        <View style={styles.toolRow} pointerEvents="box-none">
          <TvPressable
            focusKind="row"
            focusable
            hasTVPreferredFocus={preferredFocus === 'speed'}
            accessibilityRole="button"
            accessibilityLabel={tr('player.speedMenu')}
            onPress={onOpenSpeedMenu}
            onFocus={handleFocusIn}
            onBlur={handleFocusOut}
            style={styles.textButton}
          >
            <Text style={styles.speedText}>{formatPlaybackSpeed(playbackSpeed)}</Text>
          </TvPressable>
          <TvPressable
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={tr('player.abLoop')}
            onPress={onAbLoop}
            onFocus={handleFocusIn}
            onBlur={handleFocusOut}
            style={styles.iconButton}
          >
            <AppIcon
              name={abIcon}
              size={TOOL_ICON_SIZE}
              color={abActive ? accent : COLORS.textPrimary}
            />
          </TvPressable>
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
    borderRadius: PLAY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.xl,
  },
  iconButton: {
    padding: SPACING.s,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
    borderRadius: 8,
  },
  speedText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600' },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZE.title,
    fontWeight: '600',
    flex: 1,
  },
  time: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});