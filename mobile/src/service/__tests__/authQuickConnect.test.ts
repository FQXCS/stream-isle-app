/**
 * AuthService Quick Connect 编排单测（M6 文档 §6.1 AuthService.quickConnect 行）：
 * 假节拍器：轮询间隔与总超时；authenticated 后恰好换一次 Token 并走保存链路；
 * cancelQuickConnect 后立即 reject 且不再轮询；授权码失效（404 翻译）立即终止。
 */
import type { AuthResult, QuickConnectSession } from '@/adapter/model';
import type { QuickConnectDeps } from '@/service/AuthService';
import { createQuickConnectFlow } from '@/service/AuthService';
import { AppError } from '@/infra/error';

const SESSION: QuickConnectSession = { code: '123456', secret: 'sec-1' };

const AUTH: AuthResult = {
  userId: 'u1',
  userName: 'alice',
  token: 'acc-1',
  serverId: 'srv-1',
};

/** 假节拍器：记录 schedule 间隔；手动推进（推进前冲刷微任务，保证在途 poll 已排程） */
function makeFakeScheduler() {
  const intervals: number[] = [];
  const tasks: (() => void)[] = [];
  const setTimer = (fn: () => void, ms: number): unknown => {
    intervals.push(ms);
    tasks.push(fn);
    return tasks.length - 1;
  };
  const clearTimer = (id: unknown): void => {
    const index = id as number;
    tasks[index] = () => undefined;
  };
  const drain = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  };
  const advance = async (): Promise<void> => {
    await drain();
    const pending = tasks.splice(0);
    pending.forEach((task) => task());
    await drain();
  };
  return { intervals, advance, setTimer, clearTimer };
}

/** 组装假 adapter（轮询脚本按序出队） */
function makeFakeAdapter(
  pollResults: ({ authenticated: boolean } | Error)[],
  opts?: { loginCount?: { value: number } }
): QuickConnectDeps['adapter'] {
  let call = 0;
  return {
    isQuickConnectEnabled: () => Promise.resolve(true),
    initiateQuickConnect: () => Promise.resolve(SESSION),
    pollQuickConnect: () => {
      const next = pollResults[Math.min(call, pollResults.length - 1)];
      call += 1;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    loginWithQuickConnect: () => {
      if (opts?.loginCount !== undefined) {
        opts.loginCount.value += 1;
      }
      return Promise.resolve(AUTH);
    },
  };
}

describe('AuthService Quick Connect 编排（M6 §6.1）', () => {
  it('假节拍器：authenticated 后恰好换一次 Token 并走一次保存链路', async () => {
    const scheduler = makeFakeScheduler();
    const loginCount = { value: 0 };
    const saved: AuthResult[] = [];
    const flow = createQuickConnectFlow(SESSION, {
      adapter: makeFakeAdapter(
        [{ authenticated: false }, { authenticated: true }],
        { loginCount }
      ),
      pollIntervalMs: 5_000,
      timeoutMs: 120_000,
      nowFn: () => 0,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      save: (auth) => {
        saved.push(auth);
        return Promise.resolve();
      },
    });
    const pending = flow.awaitAuthorization();
    // 第 1 次轮询（未授权）→ 调度下一次（间隔 5s）→ 第 2 次轮询（已授权 → 换 Token）
    await scheduler.advance();
    await Promise.resolve();
    await scheduler.advance();
    const auth = await pending;
    expect(auth).toEqual(AUTH);
    expect(loginCount.value).toBe(1);
    expect(saved).toEqual([AUTH]);
    expect(scheduler.intervals).toEqual([5_000]);
  });

  it('总超时：nowFn 越过 timeout 后 reject QUICK_CONNECT_TIMEOUT 且不再换 Token', async () => {
    const scheduler = makeFakeScheduler();
    let now = 0;
    const loginCount = { value: 0 };
    const flow = createQuickConnectFlow(SESSION, {
      adapter: makeFakeAdapter([{ authenticated: false }], { loginCount }),
      pollIntervalMs: 5_000,
      timeoutMs: 120_000,
      nowFn: () => now,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      save: () => Promise.resolve(),
    });
    const pending = flow.awaitAuthorization();
    now = 120_001;
    await scheduler.advance();
    await expect(pending).rejects.toMatchObject({ code: 'QUICK_CONNECT_TIMEOUT' });
    expect(loginCount.value).toBe(0);
  });

  it('cancel 后立即 reject QUICK_CONNECT_CANCELLED 且不再轮询', async () => {
    const scheduler = makeFakeScheduler();
    const pollCalls = { value: 0 };
    const adapter = makeFakeAdapter([{ authenticated: false }]);
    const originalPoll = adapter.pollQuickConnect;
    adapter.pollQuickConnect = (secret: string) => {
      pollCalls.value += 1;
      return originalPoll(secret);
    };
    const flow = createQuickConnectFlow(SESSION, {
      adapter,
      pollIntervalMs: 5_000,
      timeoutMs: 120_000,
      nowFn: () => 0,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      save: () => Promise.resolve(),
    });
    const pending = flow.awaitAuthorization();
    await scheduler.advance(); // 至少完成 1 次轮询
    const callsBeforeCancel = pollCalls.value;
    expect(callsBeforeCancel).toBeGreaterThanOrEqual(1);
    flow.cancel();
    await expect(pending).rejects.toMatchObject({ code: 'QUICK_CONNECT_CANCELLED' });
    // 取消后推进节拍器不再轮询（M6 §6.1「立即 reject 且不再轮询」）
    await scheduler.advance();
    expect(pollCalls.value).toBe(callsBeforeCancel);
  });

  it('授权码失效（poll 404 → QUICK_CONNECT_EXPIRED）立即终止', async () => {
    const scheduler = makeFakeScheduler();
    const flow = createQuickConnectFlow(SESSION, {
      adapter: makeFakeAdapter([new AppError('QUICK_CONNECT_EXPIRED')]),
      pollIntervalMs: 5_000,
      timeoutMs: 120_000,
      nowFn: () => 0,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      save: () => Promise.resolve(),
    });
    const pending = flow.awaitAuthorization();
    await scheduler.advance();
    await Promise.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'QUICK_CONNECT_EXPIRED' });
    // 失效后不再排下轮（intervals 只有初始 0 次排程，无后续）
    expect(scheduler.intervals).toEqual([]);
  });
});
