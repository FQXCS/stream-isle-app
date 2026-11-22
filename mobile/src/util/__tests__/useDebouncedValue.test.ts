/**
 * 防抖单测（M4 文档 §6.1 useDebouncedValue 行）：400ms 内连续变更仅末次生效。
 * React 19 不随包提供 test-renderer/@testing-library 且本里程碑不新增依赖，
 * 防抖行为核心（createDebouncer 纯逻辑）以 fake timers 直接覆盖；hook 为薄接线
 * （cleanup 取消旧计时器 + push 新计时器，语义与核心一致）。
 */
import { createDebouncer } from '@/util/useDebouncedValue';

describe('createDebouncer（useDebouncedValue 防抖核心，M4 §4.3 搜索防抖）', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('400ms 内连续变更仅末次生效', () => {
    const committed: string[] = [];
    const debouncer = createDebouncer<string>(400, (value) => committed.push(value));
    debouncer.push('a');
    jest.advanceTimersByTime(200);
    debouncer.push('b');
    jest.advanceTimersByTime(200);
    debouncer.push('c');
    jest.advanceTimersByTime(200);
    // 停顿前不生效
    expect(committed).toEqual([]);
    // 停顿满延迟后仅末次生效
    jest.advanceTimersByTime(200);
    expect(committed).toEqual(['c']);
  });

  it('变更后停顿满延迟即产出该值（单次变更）', () => {
    const committed: number[] = [];
    const debouncer = createDebouncer<number>(400, (value) => committed.push(value));
    debouncer.push(1);
    jest.advanceTimersByTime(400);
    expect(committed).toEqual([1]);
  });

  it('dispose 取消在途计时（卸载/依赖变更清理语义）', () => {
    const committed: string[] = [];
    const debouncer = createDebouncer<string>(400, (value) => committed.push(value));
    debouncer.push('x');
    debouncer.dispose();
    jest.advanceTimersByTime(1000);
    expect(committed).toEqual([]);
  });

  it('dispose 后可继续 push（hook 每次依赖变更新建防抖器的等价语义）', () => {
    const committed: string[] = [];
    const debouncer = createDebouncer<string>(400, (value) => committed.push(value));
    debouncer.push('old');
    debouncer.dispose();
    debouncer.push('new');
    jest.advanceTimersByTime(400);
    expect(committed).toEqual(['new']);
  });
});
