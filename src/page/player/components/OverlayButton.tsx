/**
 * 控制层图标按钮：RNGH Tap 检测器驱动（本机型 Fabric 下 JS responder 的 Pressable
 * 在沉浸浮层上命中不稳定，RNGH 与手势层同链路可靠）；无障碍语义保留在 View 上。
 */
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { SPACING } from '@/constant/theme';

interface OverlayButtonProps {
  icon?: AppIconName;
  /** 文本态按钮（如倍速 1.0X）：与 icon 二选一 */
  text?: string;
  /** 无障碍朗读文案（纯图标按钮必须提供） */
  label: string;
  color: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}

export function OverlayButton({ icon, text, label, color, onPress, style, iconSize = 22 }: OverlayButtonProps) {
  const tap = Gesture.Tap().onEnd((_event, success) => {
    'worklet';
    if (success) {
      runOnJS(onPress)();
    }
  });
  return (
    <GestureDetector gesture={tap}>
      <View
        style={[styles.base, style]}
        accessible
        accessibilityLabel={label}
        accessibilityRole="button"
      >
        {text !== undefined ? (
          <Text style={[styles.text, { color }]}>{text}</Text>
        ) : (
          <AppIcon name={icon as AppIconName} size={iconSize} color={color} />
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: SPACING.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 16, fontWeight: '600' },
});