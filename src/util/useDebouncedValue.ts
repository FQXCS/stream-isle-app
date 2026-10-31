/**
 * 防抖值 hook（04 文档 §4.3/§4.8）：输入连续变更时仅在停顿 delayMs 后产出末次值。
 * 搜索页 400ms 防抖消费；纯自建实现，无第三方依赖。
 * 计时核心抽为 createDebouncer 纯逻辑（React 19 无 test-renderer 且本里程碑不新增
 * 测试依赖，防抖行为以纯函数单测覆盖，hook 仅薄接线）。
 */
import { useEffect, useState } from 'react';

/** 防抖计时核心：连续 push 仅末次在停顿 delayMs 后回调 onCommit */
export interface Debouncer<T> {
  push(value: T): void;
  /** 取消在途计时（组件卸载/依赖变更清理用） */
  dispose(): void;
}

/** 创建防抖器（纯逻辑，供 hook 与单测共用） */
export function createDebouncer<T>(
  delayMs: number,
  onCommit: (value: T) => void
): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    push(value: T) {
      // 停顿前的每次变更都重置计时器（仅末次生效）
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        onCommit(value);
      }, delayMs);
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * 防抖值：value 连续变更仅末次在停顿 delayMs 后生效（400ms 内连续变更仅末次生效，04 §6.1）。
 *
 * @param value 原始输入值
 * @param delayMs 防抖间隔（毫秒）
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    // 每次依赖变更：旧计时器随 cleanup 取消，新值重新计时（仅末次生效）
    const debouncer = createDebouncer<T>(delayMs, setDebounced);
    debouncer.push(value);
    return () => {
      debouncer.dispose();
    };
  }, [value, delayMs]);

  return debounced;
}
