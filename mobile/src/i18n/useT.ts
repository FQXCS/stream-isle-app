/**
 * 组件内翻译 hook：订阅 settingsStore.language，偏好变化时重渲染并返回新翻译函数。
 * UI 组件必须使用本 hook（而不是模块级 t），否则已挂载页面不会随语言切换刷新。
 */
import { useMemo } from 'react';

import { resolveLanguage } from '@/i18n/language';
import { translateFor, type TFunction } from '@/i18n/translate';
import { useSettingsStore } from '@/store/settingsStore';

export function useT(): TFunction {
  const preference = useSettingsStore((state) => state.language);
  return useMemo(() => {
    const language = resolveLanguage(preference);
    return (key, params) => translateFor(language, key, params);
  }, [preference]);
}
