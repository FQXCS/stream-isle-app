/**
 * 轻量操作反馈 Toast（04 §4.2：自建 reanimated 底部浮层，M1 401 提示曾用 ToastAndroid，
 * 收口后操作级失败统一走本组件；无第三方依赖）。
 * showToast(message, type) 全局调用；ToastHost 由根组件挂载一次。
 */
import { useEffect, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** Toast 类型：info 常规反馈 / error 操作失败（红底） */
type ToastType = 'info' | 'error';

interface ToastPayload {
  message: string;
  type: ToastType;
  /** 自增序号：同文案连续触发也重新计时不合并 */
  seq: number;
}

/** 底部浮层停留时长 */
const TOAST_DURATION_MS = 2000;
/** 进出场动画时长 */
const TOAST_ANIMATION_MS = 200;

type ToastListener = (payload: ToastPayload) => void;

let toastListener: ToastListener | null = null;
let toastSeq = 0;

/** 全局轻提示：操作级失败（收藏/已看/设置保存）与常规反馈统一入口 */
export function showToast(message: string, type: ToastType = 'info'): void {
  toastSeq += 1;
  toastListener?.({ message, type, seq: toastSeq });
}

/** 单条 Toast 浮层（入场渐显上移、停留后渐隐退场） */
function ToastItem({ payload, index }: { payload: ToastPayload; index: number }) {
  const t = useTheme();
  const styles = createStyles(t);
  const offset = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(0, { duration: TOAST_ANIMATION_MS });
    opacity.value = withTiming(1, { duration: TOAST_ANIMATION_MS });
    const timer = setTimeout(() => {
      offset.value = withTiming(40, { duration: TOAST_ANIMATION_MS });
      opacity.value = withTiming(0, { duration: TOAST_ANIMATION_MS });
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // payload.seq 变化即重新入场计时
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.seq]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.toast,
        payload.type === 'error' && styles.toastError,
        { bottom: TOAST_BOTTOM_OFFSET + index * 56 },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{payload.message}</Text>
    </Animated.View>
  );
}

/** 底部基准偏移 */
const TOAST_BOTTOM_OFFSET = 48;

/** 根组件挂载一次：订阅 showToast 的全局监听并渲染浮层 */
export function ToastHost() {
  const t = useTheme();
  const styles = createStyles(t);
  const [items, setItems] = useState<ToastPayload[]>([]);

  useEffect(() => {
    toastListener = (payload) => {
      // 单条在途：新 Toast 顶替旧条（轻量反馈无排队需求）
      setItems([payload]);
    };
    return () => {
      toastListener = null;
    };
  }, []);

  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.host} pointerEvents="box-none">
      {items.map((payload, index) => (
        <ToastItem key={payload.seq} payload={payload} index={index} />
      ))}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '80%',
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    elevation: 8,
  },
  toastError: { backgroundColor: t.danger },
  text: { color: t.textPrimary, fontSize: FONT_SIZE.body },
});
