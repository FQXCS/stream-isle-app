/**
 * 单选弹层（04 文档 §4.5 新建）：底部弹出的互斥单选项列表（用户切换/字幕语言等）。
 * Modal + 选项行；当前选中项高亮。泛型 key 支持字符串取值（含 "default" 这类空值键）。
 */
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface RadioOptionSheetProps<K extends string> {
  /** 弹层标题 */
  title: string;
  visible: boolean;
  /** 当前选中 key */
  selectedKey: K;
  /** 选项（key 互斥） */
  optionList: readonly { key: K; label: string }[];
  onSelect: (key: K) => void;
  onClose: () => void;
}

export function RadioOptionSheet<K extends string>({
  title,
  visible,
  selectedKey,
  optionList,
  onSelect,
  onClose,
}: RadioOptionSheetProps<K>) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* 半透明遮罩点击关闭；面板吃掉点击（no-op）防止冒泡误关 */}
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          {optionList.map((option) => {
            const active = option.key === selectedKey;
            return (
              <Pressable
                key={option.key}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
                onPress={() => {
                  onSelect(option.key);
                  onClose();
                }}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                  {option.label}
                </Text>
                {active && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: t.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.l,
    gap: SPACING.s,
  },
  title: {
    color: t.textPrimary,
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    marginBottom: SPACING.s,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    borderRadius: POSTER_RADIUS,
    backgroundColor: t.bg,
  },
  pressed: { opacity: 0.7 },
  optionText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  optionTextActive: { color: t.accent },
  check: { color: t.accent, fontSize: FONT_SIZE.body },
});
