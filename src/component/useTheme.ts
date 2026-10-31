/**
 * 主题 hook（M6 文档 §4.6.1）：useTheme() = resolveTokens(settingsStore.themeMode, useColorScheme())。
 * 页面消费 token 渲染；媒体沉浸页白名单（Player/PhotoViewer/NowPlaying 大封面态）不使用本 hook，
 * 维持 constant/theme.ts 的固定深色 COLORS。
 */
import { useColorScheme } from 'react-native';

import { resolveTokens, type SystemScheme, type ThemeTokens } from '@/constant/theme';
import { useSettingsStore } from '@/store/settingsStore';

/** 当前主题 token（themeMode 变化/系统方案变化即响应式重渲染） */
export function useTheme(): ThemeTokens {
  const mode = useSettingsStore((state) => state.themeMode);
  const systemScheme = useColorScheme();
  return resolveTokens(mode, systemScheme === 'light' ? 'light' : 'dark');
}

/** 当前生效方案（NavigationContainer theme / StatusBar 图标色消费） */
export function useResolvedScheme(): SystemScheme {
  const mode = useSettingsStore((state) => state.themeMode);
  const systemScheme = useColorScheme();
  if (mode === 'light') {
    return 'light';
  }
  if (mode === 'dark') {
    return 'dark';
  }
  return systemScheme === 'light' ? 'light' : 'dark';
}
