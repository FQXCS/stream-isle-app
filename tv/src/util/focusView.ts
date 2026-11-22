/**
 * TV 焦点中继工具（TV-m1 边缘引导）：命令式聚焦指定实例。
 * 走 ReactViewManager 的 'focus' 命令（ReactViewGroup.requestFocus），
 * 经 UIManager.dispatchViewManagerCommand 派发（Fabric 分支 findShadowNodeByTag →
 * dispatchCommand）。注意不能用 UIManager.focus——bridgeless 下仅注册在 iOS 键（TV-m1 实测）。
 */
import { findNodeHandle, UIManager } from 'react-native';
import type { ComponentRef } from 'react';
import type { View } from 'react-native';

export function requestFocusOf(instance: ComponentRef<typeof View> | null): void {
  const tag = findNodeHandleTagOf(instance);
  if (tag === null) {
    return;
  }
  // 类型签名 commandName: number 为旧架构遗留；Fabric 分支运行时接受字符串命令名
  // （BridgelessUIManager 内 Stringify 后 dispatchCommand）
  const dispatch = UIManager.dispatchViewManagerCommand as unknown as (
    reactTag: number,
    commandName: string,
    commandArgs: unknown[]
  ) => void;
  dispatch(tag, 'focus', []);
}

/** 实例 → React tag（null 安全；nextFocus* props 与 focus 命令都用 tag 寻址） */
export function findNodeHandleTagOf(instance: ComponentRef<typeof View> | null): number | null {
  if (instance === null) {
    return null;
  }
  const tag = findNodeHandle(instance);
  return tag === undefined ? null : tag;
}
