/**
 * 活跃账号 adapter 获取入口（M1 文档 §4.7；02 §4.1 / 05 §4.8 引用）。
 * 活跃账号切换/重登（token 变更）后由调用方重新获取。
 *
 * 线路故障转移（M9）：网络不可达时按服务器线路顺序切到下一条并重试一次请求；
 * 401/404 等业务错误不切线路（否则会把「服务器正常但无权限」误判成线路问题）。
 */
import { createAdapter } from '@/adapter';
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import { AppError } from '@/infra/error';
import { getTokenFromMemory } from '@/infra/tokenVault';
import { getActiveAccount, useAccountStore } from '@/store/accountStore';

/** 一次请求最多尝试的线路数（防止线路配置异常时无限重试） */
const MAX_ROUTE_ATTEMPTS = 3;

/** 是否可触发线路故障转移：仅网络不可达 */
function canFailover(err: unknown): boolean {
  return err instanceof AppError && err.code === 'NETWORK_UNREACHABLE';
}

/** 取目标方法的异步绑定版本；非异步方法（同步 URL 构造等）返回 null 直接透传 */
function bindAsyncMethod(
  target: object,
  property: PropertyKey
): ((...args: unknown[]) => Promise<unknown>) | null {
  const value = Reflect.get(target, property) as unknown;
  if (typeof value !== 'function') {
    return null;
  }
  if ((value as { constructor?: { name?: string } }).constructor?.name !== 'AsyncFunction') {
    return null;
  }
  return (value as (...args: unknown[]) => Promise<unknown>).bind(target);
}

/**
 * 取按活跃账号构造的 ServerAdapter 实例（带线路故障转移代理）。
 * 前提：App 启动时已将活跃账号 Token 预热进内存（AuthService.warmupActiveToken，§4.10 启动时序
 * 「MMKV/tokenVault 就绪」）；此处只读内存命中，保持同步签名。
 */
export function getActiveAdapter(): ServerAdapter {
  const account = getActiveAccount();
  const state = useAccountStore.getState();
  const activeUserId = state.active?.userId ?? account.activeUserId;
  if (!activeUserId) {
    throw new Error('时序错误：活跃账号缺少 userId，不应调用 getActiveAdapter()');
  }
  const token = getTokenFromMemory(account.serverId, activeUserId);

  return new Proxy(createAdapter({ baseUrl: account.baseUrl, flavor: account.flavor, token }), {
    get(target, property, receiver) {
      const bound = bindAsyncMethod(target, property);
      if (bound === null) {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        try {
          return await bound(...args);
        } catch (err) {
          if (!canFailover(err)) {
            throw err;
          }
          let lastError: unknown = err;
          for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; attempt += 1) {
            const nextBaseUrl = useAccountStore
              .getState()
              .actions.advanceActiveRoute(account.serverId);
            if (nextBaseUrl === null) {
              break;
            }
            const nextTarget = createAdapter({
              baseUrl: nextBaseUrl,
              flavor: account.flavor,
              token,
            });
            const nextBound = bindAsyncMethod(nextTarget, property);
            if (nextBound === null) {
              break;
            }
            try {
              return await nextBound(...args);
            } catch (nextErr) {
              lastError = nextErr;
              if (!canFailover(nextErr)) {
                throw nextErr;
              }
            }
          }
          throw lastError;
        }
      };
    },
  }) as unknown as ServerAdapter;
}
