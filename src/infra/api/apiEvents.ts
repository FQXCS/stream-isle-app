/**
 * 全局事件总线（M1 文档 §4.2/§4.5）：M1 仅 UNAUTHORIZED，供 401 自动登出。
 * 04 收口可声明改造为拦截器直调（M1 §8 开放问题 9 登记的升级路径）。
 */

/** 全局事件名集合 */
export type ApiEventName = 'UNAUTHORIZED';

type Listener = () => void;

/** 极简事件总线：on 订阅、emit 发布、off 退订 */
class ApiEventBus {
  private readonly listeners = new Map<ApiEventName, Set<Listener>>();

  /** 订阅事件；返回退订函数 */
  on(event: ApiEventName, listener: Listener): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener);
    };
  }

  /** 发布事件（同步通知全部订阅者） */
  emit(event: ApiEventName): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    set.forEach((listener) => {
      listener();
    });
  }
}

/** 全局单例 */
export const apiEvents = new ApiEventBus();
