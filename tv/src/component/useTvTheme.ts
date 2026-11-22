/**
 * TV 主题 hook（TV-m1 §4.5；TV 设计 §5 强制深色）：
 * 直接调共享 resolveTokens 纯函数，固定 dark/dark——不写 settingsStore（避免污染手机共享 store）。
 * accentScheme 仍读 settingsStore（设置配色在 TV 保留可选）。
 */
import { useMemo } from 'react';

import { resolveTokens, type ThemeTokens } from '@/constant/theme';
import { useSettingsStore } from '@/store/settingsStore';

/** 当前主题 token（TV 恒深色基调；accentScheme 变化时响应式重渲染） */
export function useTvTheme(): ThemeTokens {
  const accentScheme = useSettingsStore((state) => state.accentScheme);
  return useMemo(
    () => resolveTokens('dark', 'dark', accentScheme),
    [accentScheme]
  );
}
