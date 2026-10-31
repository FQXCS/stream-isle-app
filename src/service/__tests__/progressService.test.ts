/**
 * ProgressService 节流上报单测（M2 文档 §6.1 ProgressService 行；注入假时钟）。
 */
import type { PlaybackSession } from '@/adapter/model';
import { getActiveAdapter } from '@/service/adapterProvider';
import { ProgressService } from '@/service/ProgressService';

jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: jest.fn(),
}));

jest.mock('@/store/accountStore', () => ({
  useAccountStore: {
    getState: () => ({ active: { serverId: 's1', userId: 'u1' } }),
  },
}));

const mockAdapter = {
  reportProgress: jest.fn().mockResolvedValue(undefined),
};

const SESSION: PlaybackSession = {
  playSessionId: 'ps-1',
  itemId: 'item1',
  mediaSourceId: 'ms-1',
  playMethod: 'DirectPlay',
  url: 'http://srv/Videos/item1/stream?static=true&MediaSourceId=ms-1&api_key=tok',
  positionMsAtStart: 0,
  runTimeMs: 600_000,
  subtitleList: [],
  audioList: [],
  startedAtEpochMs: 0,
};

/** flush 已 void 的上报 Promise（mock resolve 的 microtask） */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ProgressService（假时钟节流）', () => {
  let now: number;

  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_000_000;
    (getActiveAdapter as jest.Mock).mockReturnValue(mockAdapter);
  });

  /** 时钟可控的 service（now 由测试推进） */
  function makeService(): ProgressService {
    return new ProgressService(() => now);
  }

  it('begin 后 9_999ms 内 onProgress 不上报', async () => {
    const service = makeService();
    service.begin(SESSION);
    now += 9_999;
    service.notifyProgress(SESSION, 5_000, false);
    await flush();
    expect(mockAdapter.reportProgress).not.toHaveBeenCalled();
  });

  it('距 begin 满 10_000ms 上报一次（isPaused 直传）', async () => {
    const service = makeService();
    service.begin(SESSION);
    now += 10_000;
    service.notifyProgress(SESSION, 10_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1);
    expect(mockAdapter.reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item1', positionMs: 10_000, isPaused: false })
    );
  });

  it('节流窗口内多次 onProgress 只报一次；下个窗口再报', async () => {
    const service = makeService();
    service.begin(SESSION);
    now += 10_000;
    service.notifyProgress(SESSION, 10_000, false);
    now += 5_000;
    service.notifyProgress(SESSION, 15_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1);
    now += 5_000; // 距上次 10s
    service.notifyProgress(SESSION, 20_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(2);
  });

  it('notifyPaused/notifyResumed/notifySeek 即时上报（不受节流限制）', async () => {
    const service = makeService();
    service.begin(SESSION);
    service.notifyPaused(SESSION, 12_000);
    service.notifyResumed(SESSION, 13_000);
    service.notifySeek(SESSION, 45_000);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(3);
    expect(mockAdapter.reportProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ positionMs: 12_000, isPaused: true })
    );
    expect(mockAdapter.reportProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ positionMs: 13_000, isPaused: false })
    );
    expect(mockAdapter.reportProgress).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ positionMs: 45_000, isPaused: false })
    );
  });

  it('seek 后节流计时重置：seek 后 9_999ms 内 onProgress 不再上报', async () => {
    const service = makeService();
    service.begin(SESSION);
    service.notifySeek(SESSION, 30_000);
    now += 9_999;
    service.notifyProgress(SESSION, 31_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1); // 仅 seek 那次
  });

  it('notifyError 即时上报后停止节流（后续 onProgress 不发）', async () => {
    const service = makeService();
    service.begin(SESSION);
    service.notifyError(SESSION, 8_000);
    now += 60_000;
    service.notifyProgress(SESSION, 9_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1); // 仅出错那次即时上报
  });

  it('end() 后停发；上报失败静默不抛出', async () => {
    const service = makeService();
    service.begin(SESSION);
    service.end();
    now += 60_000;
    service.notifyProgress(SESSION, 10_000, false);
    await flush();
    expect(mockAdapter.reportProgress).not.toHaveBeenCalled();

    // 失败静默：reportProgress reject 不冒泡
    mockAdapter.reportProgress.mockRejectedValueOnce(new Error('network'));
    const service2 = makeService();
    service2.begin(SESSION);
    service2.notifyPaused(SESSION, 1_000);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1);
  });

  // —— M5 增量（05 文档 §6.1）：intervalMs 注入 + getLastPositionMs ——

  it('音频档 30s 注入：29_999ms 不发、30_000ms 发（视频档 10s 回归不破坏）', async () => {
    const audioService = new ProgressService(() => now, 30_000);
    audioService.begin(SESSION);
    now += 29_999;
    audioService.notifyProgress(SESSION, 1_000, false);
    await flush();
    expect(mockAdapter.reportProgress).not.toHaveBeenCalled();
    now += 1; // 累计 30_000
    audioService.notifyProgress(SESSION, 2_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1);
  });

  it('视频档默认 10s 回归：注入省略时 10_000ms 触发', async () => {
    const service = makeService();
    service.begin(SESSION);
    now += 10_000;
    service.notifyProgress(SESSION, 1_000, false);
    await flush();
    expect(mockAdapter.reportProgress).toHaveBeenCalledTimes(1);
  });

  it('getLastPositionMs 返回最近一次位置（节流窗口内的 notifyProgress 不刷新）', () => {
    const service = makeService();
    expect(service.getLastPositionMs()).toBe(0);
    service.begin(SESSION);
    now += 10_000;
    service.notifyProgress(SESSION, 12_345, false);
    expect(service.getLastPositionMs()).toBe(12_345);
    // 节流窗口内被丢弃的进度不记录（位置以最近一次实际上报为准）
    now += 1_000;
    service.notifyProgress(SESSION, 99_999, false);
    expect(service.getLastPositionMs()).toBe(12_345);
    // 即时路径（paused/seek）同样刷新
    service.notifySeek(SESSION, 45_000);
    expect(service.getLastPositionMs()).toBe(45_000);
  });
});
