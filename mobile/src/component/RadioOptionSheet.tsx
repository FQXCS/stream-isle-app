/**
 * 单选弹层（M4 文档 §4.5 新建）：底部弹出的互斥单选项列表（用户切换/字幕语言等）。
 * Modal + 选项行；当前选中项高亮。泛型 key 支持字符串取值（含 "default" 这类空值键）。
 * 视觉：24 圆角面板 + 顶部抓手 + 行间发丝线，选中项尾部圆形对勾；可选色点用于配色方案。
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, SHEET_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface RadioOptionSheetProps<K extends string> {
  /** 弹层标题 */
  title: string;
  visible: boolean;
  /** 当前选中 key */
  selectedKey: K;
  /** 选项（key 互斥；swatchColor 可选色点；description 可选策略说明，标签下方小字） */
  optionList: readonly { key: K; label: string; swatchColor?: string; description?: string }[];
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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* 半透明遮罩点击关闭；面板吃掉点击（no-op）防止冒泡误关 */}
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable
          style={[styles.panel, { paddingBottom: SPACING.l + insets.bottom }]}
          onPress={() => undefined}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {optionList.map((option, index) => {
            const active = option.key === selectedKey;
            return (
              <Pressable
                key={option.key}
                style={({ pressed }) => [
                  styles.optionRow,
                  option.description !== undefined && styles.optionRowTall,
                  index > 0 && styles.optionDivider,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  onSelect(option.key);
                  onClose();
                }}
              >
                <View style={styles.optionLeft}>
                  {option.swatchColor !== undefined && (
                    <View style={[styles.optionSwatch, { backgroundColor: option.swatchColor }]} />
                  )}
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {option.label}
                    </Text>
                    {option.description !== undefined && (
                      <Text style={styles.optionDesc}>{option.description}</Text>
                    )}
                  </View>
                </View>
                {active && (
                  <View style={styles.checkCircle}>
                    <AppIcon name="check" size={12} color={t.accent} />
                  </View>
                )}
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
    mask: { flex: 1, backgroundColor: t.scrim, justifyContent: 'flex-end' },
    panel: {
      backgroundColor: t.surface,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.s,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.separator,
      marginTop: SPACING.xs,
      marginBottom: SPACING.m,
    },
    title: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.section,
      fontWeight: '700',
      marginBottom: SPACING.xs,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 54,
    },
    optionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.separator,
    },
    pressed: { opacity: 0.6 },
    optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    optionTextWrap: { flexShrink: 1, gap: 2 },
    optionDesc: { color: t.textTertiary, fontSize: FONT_SIZE.caption, lineHeight: 16 },
    optionRowTall: { paddingVertical: SPACING.s },
    optionSwatch: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
    },
    optionText: { color: t.textPrimary, fontSize: FONT_SIZE.title - 1 },
    optionTextActive: { color: t.accent, fontWeight: '600' },
    checkCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentSoft,
    },
  });
