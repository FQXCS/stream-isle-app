/**
 * 轻量操作反馈 Toast（M4 §4.2：自建 reanimated 浮层，M1 401 提示曾用 ToastAndroid，
 * 收口后操作级失败统一走本组件；无第三方依赖）。
 * - showToast：底部轻提示（失败/常规反馈）；
 * - showCenterToast：屏幕居中的大图标动作提示（加入队列等成功反馈）。
 * ToastHost 由根组件挂载一次。
 */
import { useEffect, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** Toast 类型：info 常规反馈 / error 操作失败（红底） */
type ToastType = 'info' | 'error';

/** 展示形态：bottom 底部轻提示 / center 居中动作提示 */
type ToastVariant = 'bottom' | 'center';

interface ToastPayload {
  message: string;
  type: ToastType;
  variant: ToastVariant;
  /** 自增序号：同文案连续触发也重新计时不合并 */
  seq: number;
}

/** 底部浮层停留时长 */
const TOAST_DURATION_MS = 2000;
/** 居中动作提示停留时长 */
const CENTER_TOAST_DURATION_MS = 1500;
/** 进出场动画时长 */
const TOAST_ANIMATION_MS = 200;

type ToastListener = (payload: ToastPayload) => void;

let toastListener: ToastListener | null = null;
let toastSeq = 0;

/** 全局轻提示：操作级失败（收藏/已看/设置保存）与常规反馈统一入口 */
export function showToast(message: string, type: ToastType = 'info'): void {
  toastSeq += 1;
  toastListener?.({ message, type, variant: 'bottom', seq: toastSeq });
}

/** 居中动作提示（加入队列等成功反馈）：大图标 + 文案，自动消失 */
export function showCenterToast(message: string): void {
  toastSeq += 1;
  toastListener?.({ message, type: 'info', variant: 'center', seq: toastSeq });
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

/** 居中动作提示（参考稿：深色圆角面板 + 圆形对勾 + 文案） */
function CenterToastItem({ payload }: { payload: ToastPayload }) {
  const t = useTheme();
  const styles = createStyles(t);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: TOAST_ANIMATION_MS });
    scale.value = withTiming(1, { duration: TOAST_ANIMATION_MS });
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: TOAST_ANIMATION_MS });
    }, CENTER_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [payload.seq, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.centerHost} pointerEvents="none">
      <Animated.View style={[styles.centerToast, animatedStyle]}>
        <View style={styles.checkCircle}>
          <AppIcon name="check" size={26} color="#FFFFFF" />
        </View>
        <Text style={styles.centerText}>{payload.message}</Text>
      </Animated.View>
    </View>
  );
}

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
  const centerPayload = items.find((payload) => payload.variant === 'center');
  if (centerPayload !== undefined) {
    return <CenterToastItem key={centerPayload.seq} payload={centerPayload} />;
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
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.separator,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    elevation: 8,
  },
  toastError: { backgroundColor: t.danger },
  text: { color: t.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '500' },
  /** 居中动作提示：固定深色 HUD（两套主题一致，不随页面明暗变化） */
  centerHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerToast: {
    minWidth: 200,
    maxWidth: '75%',
    backgroundColor: 'rgba(44, 48, 56, 0.92)',
    borderRadius: 16,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.m,
    elevation: 16,
  },
  checkCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
});
