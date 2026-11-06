/**
 * 会话重启浮层（M3 文档 §4.8.1）：isRestartingSession 期间全屏半透明 + 转圈 + 文案；
 * 重启中页面据此屏蔽三菜单重复点击与 netinfo 重复触发（03 §4.7.1）。
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useImmersiveAccent } from '@/component/useTheme';
import { COLORS, FONT_SIZE } from '@/constant/theme';
import { usePlayerStore } from '@/store/playerStore';

export function SessionRestartOverlay() {
  const isRestartingSession = usePlayerStore((state) => state.isRestartingSession);
  const restartNotice = usePlayerStore((state) => state.restartNotice);
  const { accent } = useImmersiveAccent();
  if (!isRestartingSession) {
    return null;
  }
  return (
    <View style={styles.overlay} pointerEvents="auto">
      <ActivityIndicator color={accent} size="large" />
      <Text style={styles.notice}>{restartNotice ?? ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  notice: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});
