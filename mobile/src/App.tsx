/**
 * App 根组件（M1 文档 §4.10 启动时序 + M6 增量）：
 * gesture-handler wrap → MMKV/tokenVault 就绪 → zustand persist rehydrate
 * → syncTlsBypassHosts 同步原生白名单 → DownloadService.rehydrate（下载快照恢复，M6 §4.4.2）
 * → OfflineProgressService.installFlushTriggers（离线补报触发器，M6 §4.5）
 * → NavigationContainer 按 gate 条件决定首栈。
 * 主题（M6 §4.6.1）：根背景与 StatusBar 图标色随主题 token；媒体沉浸页由各自页面固定深色。
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import { RootNavigator } from '@/page/navigation/RootNavigator';
import { useResolvedScheme, useTheme } from '@/component/useTheme';
import { syncTlsBypassHosts } from '@/infra/tlsBypass';
import { downloadService } from '@/service/DownloadService';
import { offlineProgressService } from '@/service/OfflineProgressService';
import { warmupActiveToken } from '@/service/AuthService';
import { useAccountStore } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';

/** 等待 zustand persist rehydrate 完成（同步存储下通常已即时完成） */
async function waitPersistHydrated(): Promise<void> {
  const persist = useAccountStore.persist;
  if (persist.hasHydrated()) {
    return;
  }
  await new Promise<void>((resolve) => {
    const unsub = persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export default function App() {
  const [bootstrapped, setBootstrapped] = useState(false);
  const t = useTheme();
  const scheme = useResolvedScheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) MMKV/tokenVault 就绪：等待 accountStore rehydrate（gate 依赖）
      await waitPersistHydrated();
      // 2) 同步原生证书白名单（persist 恢复后回填同步一次，M4 §4.6 生效时机）
      syncTlsBypassHosts(useSettingsStore.getState().allowInsecureTls);
      // 3) 预热活跃账号 Token 进内存（getActiveAdapter 同步组装认证头的前提）
      await warmupActiveToken();
      if (cancelled) {
        return;
      }
      setBootstrapped(true);
      // 4) M6：下载快照恢复（downloading → paused 降级 + 恢复 queued 调度，M6 §4.4.2）；
      //    失败不阻断启动（下载页聚焦刷新会再试）
      void downloadService.rehydrate().catch(() => {
        // 静默
      });
      // 5) M6：离线补报触发器（netinfo 恢复在线/回前台/定时兜底；M6 §4.5）+
      //    冷启动立即一轮（覆盖进程被杀期间积压，在线才有实际动作）
      offlineProgressService.installFlushTriggers();
      void offlineProgressService.flush();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootstrapped) {
    // 启动引导期最小空屏（冷启动毫秒级，无需加载动画；底色跟随主题避免闪屏）
    return <View style={[styles.boot, { backgroundColor: t.bg }]} />;
  }

  return (
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: t.bg }]}>
      {/* 图标色随方案：深色底用 light 图标、浅色底用 dark 图标（M6 §4.6.1） */}
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      {/* MiniPlayer/Toast 等组件依赖 useSafeAreaInsets，必须在导航器外层提供 Provider */}
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  boot: { flex: 1 },
});
