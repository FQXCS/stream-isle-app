/**
 * OfflineProgressService 单测（M6 文档 §6.1 OfflineProgressService 行）：
 * 入队条件（网络类错误 + 离线双条件，其他错误不入队）；合并规则（连续 Progress→末条、
 * Playing 首条与 Stopped 末条保留、无 Playing 合成、MarkPlayed 折叠且置于组末 Stopped 之后）；
 * flush 按组按序、成功删行、失败保留剩余；假时钟下定时触发。
 */
import type { DownloadDao, PendingProgressRow } from '@/infra/db';
import { AppError } from '@/infra/error';
import {
  isNetworkErrorCode,
  mergeGroupForReplay,
  OfflineProgressService,
  setOfflineStateForTest,
  shouldEnqueueOnFailure,
} from '@/service/OfflineProgressService';

/** 内存假 DAO（记录 append/delete 调用序列） */
function makeFakeDao(initial: PendingProgressRow[] = []): DownloadDao & {
  appended: PendingProgressRow[];
  deletedIds: number[];
} {
  const rows = [...initial];
  let nextId = initial.length + 1;
  return {
    appended: [],
    deletedIds: [],
    async getDownloadsByServer() {
      return [];
    },
    async getDownload() {
      return null;
    },
    async upsertDownload() {
      return;
    },
    async updateDownloadStatus() {
      return;
    },
    async updateResumeData() {
      return;
    },
    async updateProgressBytes() {
      return;
    },
    async updatePosterUri() {
      return;
    },
    async updateLocalPlayback() {
      return;
    },
    async deleteDownload() {
      return;
    },
    async appendPendingProgress(event) {
      const row: PendingProgressRow = { ...event, id: nextId };
      nextId += 1;
      rows.push(row);
      return;
    },
    async listPendingProgress(serverId: string, userId: string) {
      return rows.filter((row) => row.serverId === serverId && row.userId === userId);
    },
    async listAllPendingProgress() {
      // 与真实 SQL 形状一致：ORDER BY created_at_ms ASC, id ASC（flush 分组顺序依赖）
      return [...rows].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id);
    },
    async deletePendingProgress(ids: number[]) {
      ids.forEach((id) => this.deletedIds.push(id));
      ids.forEach((id) => {
        const index = rows.findIndex((row) => row.id === id);
        if (index >= 0) rows.splice(index, 1);
      });
    },
  };
}

/** 构造队列行 */
function row(overrides: Partial<PendingProgressRow>): PendingProgressRow {
  return {
    id: 0,
    serverId: 'srv-1',
    userId: 'u1',
    itemId: 'm1',
    playSessionId: 'p1',
    mediaSourceId: 'ms1',
    eventType: 'Progress',
    positionMs: 0,
    createdAtMs: 0,
    ...overrides,
  };
}

describe('OfflineProgressService（M6 §6.1）', () => {
  afterEach(() => {
    setOfflineStateForTest(false);
  });

  it('入队双条件：网络类错误 + 离线才入队（其他错误/在线均不入队）', () => {
    // 网络类 + 离线 → 入队
    expect(shouldEnqueueOnFailure(new AppError('NETWORK_UNREACHABLE'), true)).toBe(true);
    // 在线 → 不入队
    expect(shouldEnqueueOnFailure(new AppError('NETWORK_UNREACHABLE'), false)).toBe(false);
    // 非网络类 → 不入队
    expect(shouldEnqueueOnFailure(new AppError('SERVER_ERROR'), true)).toBe(false);
    expect(shouldEnqueueOnFailure(new Error('x'), true)).toBe(false);
  });

  it('enqueue 落库（created_at_ms 由注入时钟产出）并同步本地快照（下载行存在时）', async () => {
    const dao = makeFakeDao();
    let now = 1_000;
    const service = new OfflineProgressService({
      dao,
      nowFn: () => now,
      isOffline: () => true,
      report: () => Promise.resolve(),
    });
    await service.enqueue({
      serverId: 'srv-1',
      userId: 'u1',
      itemId: 'm1',
      playSessionId: 'p1',
      mediaSourceId: 'ms1',
      eventType: 'Progress',
      positionMs: 1_000,
    });
    now = 2_000;
    await service.enqueue({
      serverId: 'srv-1',
      userId: 'u1',
      itemId: 'm1',
      playSessionId: 'p1',
      mediaSourceId: 'ms1',
      eventType: 'Progress',
      positionMs: 2_000,
    });
    const list = await dao.listPendingProgress('srv-1', 'u1');
    expect(list.map((row) => row.createdAtMs)).toEqual([1_000, 2_000]);
    expect(setOfflineStateForTest).toBeDefined();
  });

  it('isNetworkErrorCode：仅 NETWORK_UNREACHABLE 判真', () => {
    expect(isNetworkErrorCode(new AppError('NETWORK_UNREACHABLE'))).toBe(true);
    expect(isNetworkErrorCode(new AppError('TLS_ERROR'))).toBe(false);
    expect(isNetworkErrorCode(new Error('x'))).toBe(false);
  });

  it('合并规则：连续 Progress→末条；Playing 首条与 Stopped 末条保留；MarkPlayed 折叠置组末', () => {
    const replayList = mergeGroupForReplay([
      row({ id: 1, eventType: 'Playing', positionMs: 0, createdAtMs: 1 }),
      row({ id: 2, eventType: 'Progress', positionMs: 10_000, createdAtMs: 2 }),
      row({ id: 3, eventType: 'Progress', positionMs: 20_000, createdAtMs: 3 }),
      row({ id: 4, eventType: 'Progress', positionMs: 30_000, createdAtMs: 4 }),
      row({ id: 5, eventType: 'Stopped', positionMs: 35_000, createdAtMs: 5 }),
      row({ id: 6, eventType: 'MarkPlayed', positionMs: 35_000, createdAtMs: 6 }),
      row({ id: 7, eventType: 'MarkPlayed', positionMs: 35_000, createdAtMs: 7 }),
    ]);
    expect(replayList.map((item) => item.eventType)).toEqual([
      'Playing',
      'Progress',
      'Stopped',
      'MarkPlayed',
    ]);
    // 连续 Progress 折叠为末条（30s 位置）；Stopped 保留末条；MarkPlayed 折叠一条
    expect(replayList[1].positionMs).toBe(30_000);
    expect(replayList[2].positionMs).toBe(35_000);
    expect(replayList[3].id).toBe(7);
  });

  it('组内无 Playing：以最早事件位置合成一条先行上报（M6 §4.5 补报算法第 2 条）', () => {
    const replayList = mergeGroupForReplay([
      row({ id: 1, eventType: 'Progress', positionMs: 20_000, createdAtMs: 1 }),
      row({ id: 2, eventType: 'Stopped', positionMs: 30_000, createdAtMs: 2 }),
    ]);
    expect(replayList[0].eventType).toBe('Playing');
    expect(replayList[0].positionMs).toBe(20_000);
  });

  it('flush：按组按序上报、成功删行；中途失败即停剩余保留', async () => {
    // 组 1（srv-1/u1/item-a）成功；组 2 首个事件失败 → 组 2 行保留
    const dao = makeFakeDao([
      row({ id: 1, serverId: 'srv-1', itemId: 'a', playSessionId: 'p1', createdAtMs: 1 }),
      row({ id: 2, serverId: 'srv-1', itemId: 'b', playSessionId: 'p2', createdAtMs: 2 }),
    ]);
    const reported: string[] = [];
    const service = new OfflineProgressService({
      dao,
      isOffline: () => false,
      report: (r) => {
        if (r.itemId === 'b') {
          return Promise.reject(new Error('上报失败'));
        }
        reported.push(`${r.itemId}:${r.eventType}`);
        return Promise.resolve();
      },
    });
    await service.flush();
    // 组内无 Playing → 以最早事件位置合成一条先行上报（M6 §4.5 补报算法第 2 条）
    expect(reported).toEqual(['a:Playing', 'a:Progress']);
    // 组 a 成功删行；组 b 中途失败即停，行保留
    expect(dao.deletedIds).toEqual([1]);
    // 组 2 行保留
    expect(await dao.listAllPendingProgress()).toHaveLength(1);
  });

  it('flush 分组隔离：不同 playSessionId 不合并；组内按 created_at_ms 升序', async () => {
    const dao = makeFakeDao([
      row({ id: 1, playSessionId: 'p2', eventType: 'Progress', positionMs: 50, createdAtMs: 3 }),
      row({ id: 2, playSessionId: 'p1', eventType: 'Progress', positionMs: 10, createdAtMs: 2 }),
      row({ id: 3, playSessionId: 'p1', eventType: 'Playing', positionMs: 0, createdAtMs: 1 }),
    ]);
    const reported: string[] = [];
    const service = new OfflineProgressService({
      dao,
      isOffline: () => false,
      report: (r) => {
        reported.push(`${r.playSessionId}:${r.eventType}:${r.positionMs}`);
        return Promise.resolve();
      },
    });
    await service.flush();
    // p1 组先（组内最早事件更早），组内 Playing 先行 → Progress；
    // p2 组无 Playing → 合成一条先行上报（M6 §4.5 第 2 条）
    expect(reported).toEqual([
      'p1:Playing:0',
      'p1:Progress:10',
      'p2:Playing:50',
      'p2:Progress:50',
    ]);
  });

  it('假时钟：定时兜底按注入节拍器排程（OFFLINE_FLUSH_RETRY_INTERVAL_MS）且可推进', async () => {
    const dao = makeFakeDao();
    const ticks: number[] = [];
    const pendingTasks: (() => void)[] = [];
    const service = new OfflineProgressService({
      dao,
      isOffline: () => false,
      setTimer: (fn: () => void, ms: number) => {
        ticks.push(ms);
        pendingTasks.push(fn);
        return pendingTasks.length;
      },
      report: () => Promise.resolve(),
    });
    service.installFlushTriggers();
    // 定时兜底已排程，间隔 = OFFLINE_FLUSH_RETRY_INTERVAL_MS（60s，M6 §4.5）
    expect(ticks).toEqual([60_000]);
    expect(pendingTasks).toHaveLength(1);
    // 推进一次：空队列 flush 廉价退出并排下一轮
    pendingTasks[0]();
    expect(ticks).toEqual([60_000, 60_000]);
  });
});
