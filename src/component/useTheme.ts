/**
 * 主题 hook（M6 文档 §4.6.1）：useTheme() = resolveTokens(themeMode, useColorScheme(), accentScheme)。
 * 页面消费 token 渲染；媒体沉浸页白名单（Player/PhotoViewer/NowPlaying 大封面态）不使用本 hook，
 * 维持 constant/theme.ts 的固定深色 COLORS，只通过 useImmersiveAccent 取配色方案的暗色主色。
 */
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  ACCENT_SCHEMES,
  DEFAULT_ACCENT_SCHEME,
  resolveTokens,
  type AccentColorTokens,
  type SystemScheme,
  type ThemeTokens,
} from '@/constant/theme';
import { useSettingsStore } from '@/store/settingsStore';

/** 当前主题 token（themeMode / 配色方案 / 系统方案变化即响应式重渲染） */
export function useTheme(): ThemeTokens {
  const mode = useSettingsStore((state) => state.themeMode);
  const accentScheme = useSettingsStore((state) => state.accentScheme);
  const systemScheme = useColorScheme();
  return useMemo(
    () => resolveTokens(mode, systemScheme === 'light' ? 'light' : 'dark', accentScheme),
    [mode, accentScheme, systemScheme]
  );
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

/** 媒体沉浸页固定深色下的强调色（跟随设置里的配色方案） */
export function useImmersiveAccent(): AccentColorTokens {
  const accentScheme = useSettingsStore((state) => state.accentScheme);
  return (ACCENT_SCHEMES[accentScheme] ?? ACCENT_SCHEMES[DEFAULT_ACCENT_SCHEME]).dark;
}
