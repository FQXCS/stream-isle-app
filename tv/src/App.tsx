/**
 * TV App 根组件（TV-m1 §4.1）：启动时序对齐手机（MMKV/tokenVault 就绪 → persist rehydrate
 * → TLS 白名单回同步 → 活跃 Token 预热），随后强制登录 gate（TV-m1-S1，刻意区别于手机 M9 免登录）：
 * 有活跃账号 → TvNavigator（壳）；无 → TvOnboardingRoot（登录引导，非手机游客空态）。
 * rehydrate 期间空屏不闪登录页（验收 #2）。401 守卫挂根（gate 切换不丢订阅，TV-m1 §4.7）。
 * TV 无下载/音频引擎/手势包装（TV 设计 §1.2 范围外）。
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { syncTlsBypassHosts } from '@/infra/tlsBypass';
import { warmupActiveToken } from '@/service/AuthService';
import { useAccountStore } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';
import { ToastHost } from '@/component/Toast';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TvNavigator } from '@tv/navigation/TvNavigator';
import { TvOnboardingRoot } from '@tv/page/onboarding/TvOnboardingRoot';
import { useUnauthorizedGuard } from '@tv/util/useUnauthorizedGuard';

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
  const t = useTvTheme();
  // 强制登录 gate（TV-m1-S1）：active 存在 → 壳；无 → 登录引导
  const hydrated = useAccountStore((state) => state.hydrated);
  const active = useAccountStore((state) => state.active);
  // 401 守卫挂根：expireActiveUser 后 gate 切屏不丢订阅（TV-m1 §4.7）
  useUnauthorizedGuard();

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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 启动引导期 + persist rehydrate 期间空屏（与手机同口径，验收 #2 不闪登录页）
  if (!bootstrapped || !hydrated) {
    return <View style={[styles.boot, { backgroundColor: t.bg }]} />;
  }

  return (
    <SafeAreaProvider>
      {/* TV insets 为 0（TvScreenFrame 接管边距）；ToastHost 根挂一次（白名单组件） */}
      <View style={[styles.flex, { backgroundColor: t.bg }]}>
        <StatusBar style="light" />
        {active !== null ? <TvNavigator /> : <TvOnboardingRoot />}
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  boot: { flex: 1 },
});
