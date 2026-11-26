/**
 * TV 会话重启浮层（TV-m3 §4.4/风险 5，照抄手机 SessionRestartOverlay）：
 * isRestartingSession 期间全屏半透 + 转圈 + 文案；重启中 TvKeyLayer 屏蔽遥控按键
 * （BACK 退出仍可用），onLoad 后由 endRestart 收起。手机组件住 @/page（TV 禁入）故重写。
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useImmersiveAccent } from '@/component/useTheme';
import { COLORS, FONT_SIZE } from '@/constant/theme';
import { usePlayerStore } from '@/store/playerStore';

export function TvSessionRestartOverlay() {
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