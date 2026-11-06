/**
 * 音频引导浮层（M5 文档 §4.14）：根布局组件（非路由），监听 playerStore.audio 首次
 * idle → playing 转移触发一次性流程：
 * 1. Android 13+ 请求 POST_NOTIFICATIONS（通知栏控制可见性，A11 前提）；
 * 2. 弹说明对话框（电池优化白名单 + 国产 ROM 自启动话术）；
 * 3. 「去设置」→ IntentLauncher 直达电池优化弹窗（被 ROM 拦截回退列表页）；「暂不」仅关闭；
 * 4. 无论选择写 settingsStore.batteryGuideShown（持久化，之后不再弹）。
 */
import { useEffect, useRef, useState } from 'react';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ANDROID_APPLICATION_ID } from '@/constant/app';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';

export function AudioPermissionGuide() {
  const t = useTheme();
  const styles = createStyles(t);
  const status = usePlayerStore((state) => state.audio.status);
  const batteryGuideShown = useSettingsStore((state) => state.batteryGuideShown);
  const setBatteryGuideShown = useSettingsStore((state) => state.actions.setBatteryGuideShown);
  // 首次 idle → playing 转移标记（ref：流程一次性，不随渲染变化）
  const playedOnceRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'playing' && !playedOnceRef.current) {
      playedOnceRef.current = true;
      if (!batteryGuideShown) {
        void runGuideFlow(setVisible);
      }
    }
  }, [status, batteryGuideShown, setBatteryGuideShown]);

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.mask}>
        <View style={styles.dialog}>
          <Text style={styles.title}>后台播放设置建议</Text>
          <Text style={styles.message}>
            为避免后台播放被系统省电中断，建议允许忽略电池优化；小米/华为等机型还需在设置中允许自启动/后台运行。
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                setVisible(false);
                setBatteryGuideShown();
              }}
            >
              <Text style={styles.secondaryText}>暂不</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={() => {
                setVisible(false);
                setBatteryGuideShown();
                openBatteryOptimizationSettings();
              }}
            >
              <Text style={styles.primaryText}>去设置</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 引导流程第 1 步：Android 13+ 通知权限（失败不阻塞后续弹窗） */
async function runGuideFlow(showDialog: (value: boolean) => void): Promise<void> {
  // Android Platform.Version 为字符串形态（SDK 58 RN 类型 string | number），数值化比较
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    try {
      const { PermissionsAndroid } = await import('react-native');
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      // 通知权限被拒不阻塞播放（05 文档 §4.17：可在系统设置补开）
    }
  }
  showDialog(true);
}

/**
 * 「去设置」：直达电池优化弹窗；被 ROM 拦截（目标 activity 不存在等，异步 rejection）
 * 回退系统设置（05 文档 §4.14 回退路径）。
 */
async function openBatteryOptimizationSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${ANDROID_APPLICATION_ID}` }
    );
  } catch {
    void Linking.openSettings();
  }
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  mask: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.scrim,
  },
  dialog: {
    marginHorizontal: SPACING.xl,
    padding: SPACING.l,
    borderRadius: 12,
    backgroundColor: t.surface,
    gap: SPACING.m,
  },
  title: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  message: { color: t.textSecondary, fontSize: FONT_SIZE.body, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: SPACING.s, justifyContent: 'flex-end' },
  button: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderRadius: 8,
  },
  primaryButton: { backgroundColor: t.accent },
  secondaryButton: { backgroundColor: 'transparent' },
  primaryText: { color: t.accentOn, fontSize: FONT_SIZE.body, fontWeight: '500' },
  secondaryText: { color: t.textSecondary, fontSize: FONT_SIZE.body },
});
