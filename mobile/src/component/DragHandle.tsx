/**
 * 拖动把手（设置页已启用区）：图标库 drag-vertical，
 * 长按触发 ReorderableList 的 drag；颜色比标签文字更浅。
 */
import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface DragHandleProps {
  onLongPress: () => void;
}

export function DragHandle({ onLongPress }: DragHandleProps) {
  const t = useTheme();
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={150}
      hitSlop={SPACING.s}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="拖动排序"
    >
      <AppIcon name="dragHandle" size={20} color={t.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.5 },
});
