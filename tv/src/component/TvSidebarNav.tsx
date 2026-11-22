/**
 * TV 侧边栏（TV-m1 §4.2；TV 设计 §6.1，对标 Emby TV 官方客户端）：
 * 收起态 88dp（图标 32 号）/ 焦点进入展开 200dp（图标 + 标签）；
 * TVFocusGuideView destinations 双向引导侧栏↔内容区（右键进内容、内容左缘回侧栏）；
 * 上下键栏内切换由 Android 焦点搜索驱动。不用 bottom-tabs（TV 设计 §6.1）。
 */
import { useState } from 'react';
import type { ComponentRef } from 'react';
import { StyleSheet, Text, TVFocusGuideView, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import type { AppIconName } from '@/component/AppIcon';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

/** 侧栏项 */
export interface TvSidebarItem {
  key: string;
  label: string;
  icon: AppIconName;
}

interface TvSidebarNavProps {
  items: TvSidebarItem[];
  /** 当前选中项（内容区跟随） */
  selectedKey: string;
  /** DPAD_CENTER 选中回调（Shell 切换内容区） */
  onSelect(key: string): void;
  /**
   * 右键进入内容区的引导目标（TV 设计 §6.1 显式引导；侧栏容器实例由 Shell state 化持有）。
   * 传 HostInstance 而非 RefObject：fork findNodeHandle 在 React 19 下不解引 ref 对象。
   * 注：Android 上 TVFocusGuideView destinations 无原生实现（react-android AAR 无该
   * ViewManager 命令，TV-m1 实测 no-op），跨区引导实际由 nextFocus 系列与几何搜索承担；
   * 本 prop 保留为 tvOS 兼容语义（m2+ 若 Android 原生补齐即自动生效）。
   */
  contentDestination: ComponentRef<typeof View> | null;
  /** 项实例注册（Shell 持有后经 UIManager.focus 做内容区→侧栏的边缘引导中继） */
  registerItemRef?: (key: string, ref: ComponentRef<typeof View> | null) => void;
}

/** 收起态宽度（TV 设计 §6.1） */
const RAIL_WIDTH_COLLAPSED = 88;
/** 焦点展开宽度（TV 设计 §6.1） */
const RAIL_WIDTH_EXPANDED = 200;
/** 侧栏图标档（TV 设计 §10） */
const SIDEBAR_ICON_SIZE = 32;

export function TvSidebarNav({
  items,
  selectedKey,
  onSelect,
  contentDestination,
  registerItemRef,
}: TvSidebarNavProps) {
  const t = useTvTheme();
  // 任一项持焦点即展开（收起↔展开切换，无动画——TV 设计 §10 动效 ≤150ms 约束下的直切）
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const expanded = focusedKey !== null;
  return (
    <TVFocusGuideView
      destinations={contentDestination !== null ? [contentDestination] : undefined}
      style={[
        styles.rail,
        { backgroundColor: t.surface },
        expanded ? styles.railExpanded : styles.railCollapsed,
      ]}
    >
      {items.map((item) => {
        const selected = item.key === selectedKey;
        const focused = item.key === focusedKey;
        return (
          <TvPressable
            key={item.key}
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            // React 19：ref 作为普通 prop 透传内部 Pressable（供 Shell 注册实例做 focus 中继）
            ref={registerItemRef !== undefined ? (ref) => registerItemRef(item.key, ref) : undefined}
            // 宽度随形态：收起态仅包住图标（88 rail 内居中），展开态图标 + 标签
            style={expanded ? styles.itemExpanded : styles.itemCollapsed}
            onFocus={() => setFocusedKey(item.key)}
            onBlur={() => setFocusedKey((prev) => (prev === item.key ? null : prev))}
            onPress={() => onSelect(item.key)}
          >
            <AppIcon
              name={item.icon}
              size={SIDEBAR_ICON_SIZE}
              color={focused || selected ? t.accent : t.textSecondary}
              weight={selected ? 'fill' : 'regular'}
            />
            {expanded && <Text style={[styles.label, { color: t.textPrimary }]}>{item.label}</Text>}
          </TvPressable>
        );
      })}
    </TVFocusGuideView>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRadius: 20,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  railCollapsed: { width: RAIL_WIDTH_COLLAPSED, alignItems: 'center' },
  railExpanded: { width: RAIL_WIDTH_EXPANDED, paddingHorizontal: 16 },
  itemExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: RAIL_WIDTH_EXPANDED - 32,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  itemCollapsed: {
    alignItems: 'center',
    justifyContent: 'center',
    width: RAIL_WIDTH_COLLAPSED - 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  label: { fontSize: 18, fontWeight: '600' },
});
