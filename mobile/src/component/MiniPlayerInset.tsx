/**
 * 迷你条内容让位（非 Tab 的 Root Stack 页）：迷你条可见时在场景底部留出条高 + 安全区，
 * 内容区在条子上方结束，不被全局浮层遮挡。
 * 组件内部订阅 audio 状态而非由导航层传值——screenLayout/sceneStyle 这类导航选项在已挂载
 * 场景上不会因 props 变化重新应用，只有组件自身重渲染才能保证停止播放后 padding 归零。
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MINI_PLAYER_TOTAL_HEIGHT } from '@/component/MiniPlayer';
import { usePlayerStore } from '@/store/playerStore';

interface MiniPlayerInsetProps {
  children: ReactNode;
}

export function MiniPlayerInset({ children }: MiniPlayerInsetProps) {
  const insets = useSafeAreaInsets();
  const audioActive = usePlayerStore(
    (state) =>
      state.audio.engineReady &&
      state.audio.status !== 'idle' &&
      state.audio.currentTrack !== null
  );
  return (
    <View
      style={[styles.fill, { paddingBottom: audioActive ? MINI_PLAYER_TOTAL_HEIGHT + insets.bottom : 0 }]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
