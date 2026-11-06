/**
 * 播放模式按钮（M5 文档 §4.10）：点击循环 列表循环 → 随机 → 单曲循环 → 列表循环，
 * 图标与 playerStore.audio 双向同步。随机/退出随机经 AudioService.toggleShuffle
 * （队列重建，当前曲不中断）；循环模式经 AudioService.setRepeatMode。
 * 图标/文案口径与队列面板标题共用 util/playbackMode；切换后目标模式文案经 onModeChange
 * 回传页面弹提示（2s 自动消失）。
 */
import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { audioService } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { COLORS } from '@/constant/theme';
import { useT } from '@/i18n';
import { PLAYBACK_MODE_META, combinedPlaybackMode } from '@/util/playbackMode';

interface ModeButtonProps {
  /** 图标色（默认沉浸深色页白；无封面主题玻璃页由 NowPlaying 传主题色） */
  iconColor?: string;
  /** 切换后的目标模式文案（页面用于弹提示；未传则不提示） */
  onModeChange?: (label: string) => void;
}

export function ModeButton({ iconColor = COLORS.textPrimary, onModeChange }: ModeButtonProps) {
  const tr = useT();
  const repeatMode = usePlayerStore((state) => state.audio.repeatMode);
  const shuffle = usePlayerStore((state) => state.audio.shuffle);
  const mode = combinedPlaybackMode(repeatMode, shuffle);

  const handleCycle = () => {
    void audioService.cyclePlaybackMode().then((nextMode) => {
      onModeChange?.(tr(PLAYBACK_MODE_META[nextMode].labelKey));
    });
  };

  return (
    <Pressable
      hitSlop={8}
      style={styles.button}
      onPress={handleCycle}
      accessibilityLabel={tr(PLAYBACK_MODE_META[mode].labelKey)}
    >
      <AppIcon name={PLAYBACK_MODE_META[mode].icon} size={24} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
});
