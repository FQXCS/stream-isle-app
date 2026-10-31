/**
 * 断点续播弹窗（M2 文档 §4.1/§4.11）：「从 xx:xx 继续播放」主按钮 +「从头播放」次按钮。
 * 文案时间用 formatClock（毫秒口径）。
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { formatClock } from '@/util/format';

interface ResumeDialogProps {
  /** 断点位置（毫秒），> RESUME_MIN_POSITION_MS */
  resumeMs: number;
  onResume: () => void;
  onRestart: () => void;
}

export function ResumeDialog({ resumeMs, onResume, onRestart }: ResumeDialogProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onResume}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>继续播放</Text>
          <Text style={styles.hint}>上次看到 {formatClock(resumeMs)}</Text>
          <Pressable style={[styles.button, styles.primary]} onPress={onResume}>
            <Text style={styles.primaryText}>从 {formatClock(resumeMs)} 继续播放</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={onRestart}>
            <Text style={styles.secondaryText}>从头播放</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  dialog: {
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.xl,
    gap: SPACING.m,
    alignSelf: 'stretch',
  },
  title: { color: t.textPrimary, fontSize: FONT_SIZE.title },
  hint: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  button: {
    borderRadius: POSTER_RADIUS,
    paddingVertical: SPACING.m,
    alignItems: 'center',
  },
  primary: { backgroundColor: t.accent },
  primaryText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  secondary: { backgroundColor: t.bg },
  secondaryText: { color: t.textSecondary, fontSize: FONT_SIZE.body },
});
