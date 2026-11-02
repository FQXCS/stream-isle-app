/**
 * 播放模式按钮（M5 文档 §4.10）：点击循环 列表循环 → 随机 → 单曲循环 → 列表循环，
 * 图标与 playerStore.audio 双向同步。随机/退出随机经 AudioService.toggleShuffle
 * （队列重建，当前曲不中断）；循环模式经 AudioService.setRepeatMode。
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import type { RepeatModeEnum } from '@/adapter/model';
import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { audioService } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { COLORS } from '@/constant/theme';

/** 组合模式（shuffle 与 repeatMode 的合并展示态） */
type CombinedMode = 'queue' | 'shuffle' | 'track';

const MODE_META: Record<CombinedMode, { label: string; icon: AppIconName }> = {
  queue: { label: '列表循环', icon: 'repeat' },
  shuffle: { label: '随机播放', icon: 'shuffle' },
  track: { label: '单曲循环', icon: 'repeatOne' },
};

function combinedOf(repeatMode: RepeatModeEnum, shuffle: boolean): CombinedMode {
  if (shuffle) {
    return 'shuffle';
  }
  return repeatMode === 'track' ? 'track' : 'queue';
}

export function ModeButton() {
  const repeatMode = usePlayerStore((state) => state.audio.repeatMode);
  const shuffle = usePlayerStore((state) => state.audio.shuffle);
  const mode = combinedOf(repeatMode, shuffle);

  const handleCycle = () => {
    if (mode === 'queue') {
      // 列表循环 → 随机（队列重建打乱）
      void audioService.toggleShuffle();
      return;
    }
    if (mode === 'shuffle') {
      // 随机 → 单曲循环（先恢复原序，再切循环模式）
      void audioService.toggleShuffle().then(() => audioService.setRepeatMode('track'));
      return;
    }
    // 单曲循环 → 列表循环
    void audioService.setRepeatMode('queue');
  };

  return (
    <Pressable hitSlop={8} style={styles.button} onPress={handleCycle}>
      <AppIcon name={MODE_META[mode].icon} size={22} color={COLORS.textPrimary} />
      <Text style={styles.label}>{MODE_META[mode].label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  label: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
});
