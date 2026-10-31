/**
 * 控制层（M2 文档 §4.12 + M3 §4.8.1）：顶部（返回 + 「标题 · S1E2 集名」+ 锁屏按钮）；
 * 底部（播放/暂停 + 字幕/音轨/码率三按钮 + SeekBar + 时长/剩余时长）。
 * 底色 M2 用半透明黑（毛玻璃顺延 M6）；无操作 CONTROLS_AUTO_HIDE_MS 自动隐藏。
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SeekBar } from '@/page/player/components/SeekBar';
import { CONTROLS_AUTO_HIDE_MS } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { formatClock } from '@/util/format';
import { usePlayerStore } from '@/store/playerStore';

interface ControlOverlayProps {
  /** 「标题 · S1E2 集名」（详情页拼好随会话传入） */
  title: string;
  isPlaying: boolean;
  positionMs: number;
  bufferedMs: number;
  durationMs: number;
  onExit: () => void;
  onToggleLock: () => void;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void;
  /** M3 三菜单入口（字幕/音轨/码率，03 §4.8.1） */
  onOpenSubtitleMenu: () => void;
  onOpenAudioTrackMenu: () => void;
  onOpenBitrateMenu: () => void;
  /**
   * M6 本地会话控制层降级（06 文档 §4.4.2）：false 时隐藏码率按钮
   * （码率概念仅存在于服务器转码/串流会话；本地 fileUri 会话无此概念）。
   */
  showBitrate?: boolean;
}

export function ControlOverlay({
  title,
  isPlaying,
  positionMs,
  bufferedMs,
  durationMs,
  onExit,
  onToggleLock,
  onTogglePlay,
  onSeek,
  onOpenSubtitleMenu,
  onOpenAudioTrackMenu,
  onOpenBitrateMenu,
  showBitrate = true,
}: ControlOverlayProps) {
  // 无操作自动隐藏（CONTROLS_AUTO_HIDE_MS）：挂载即计时，交互（按钮/拖动）重置；
  // 控制层显隐由页面 toggleControls 驱动，本组件不持有 visible 状态
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

  const remainingMs = Math.max(0, durationMs - positionMs);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* 顶部：返回 + 标题 + 锁屏 */}
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={interact(onExit)}>
          <Text style={styles.iconText}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable style={styles.iconButton} onPress={interact(onToggleLock)}>
          <Text style={styles.iconText}>🔒</Text>
        </Pressable>
      </View>
      <View style={styles.flexSpacer} pointerEvents="none" />
      {/* 底部：播放/暂停 + 字幕/音轨/码率三按钮 + SeekBar + 时长 / 剩余 */}
      <View style={styles.bottomBar}>
        <Pressable style={styles.iconButton} onPress={interact(onTogglePlay)}>
          <Text style={styles.iconText}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={interact(onOpenSubtitleMenu)}>
          <Text style={styles.iconText}>字</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={interact(onOpenAudioTrackMenu)}>
          <Text style={styles.iconText}>音</Text>
        </Pressable>
        {showBitrate && (
          <Pressable style={styles.iconButton} onPress={interact(onOpenBitrateMenu)}>
            <Text style={styles.iconText}>码</Text>
          </Pressable>
        )}
        <SeekBar
          positionMs={positionMs}
          bufferedMs={bufferedMs}
          durationMs={durationMs}
          onPreview={scheduleHide}
          onSeek={(targetMs) => {
            onSeek(targetMs);
            scheduleHide();
          }}
        />
        <Text style={styles.time}>{formatClock(positionMs)}</Text>
        <Text style={styles.time}>-{formatClock(remainingMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.l,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingBottom: SPACING.s,
  },
  flexSpacer: { flex: 1 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iconButton: { padding: SPACING.s },
  iconText: { color: COLORS.textPrimary, fontSize: 20 },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZE.body,
    flex: 1,
    textAlign: 'center',
  },
  time: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body, minWidth: 52, textAlign: 'center' },
});
