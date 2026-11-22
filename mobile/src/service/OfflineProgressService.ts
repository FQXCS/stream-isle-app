/**
 * 离线进度入队与补报服务（M6 文档 §4.5 核心链路）：
 * ProgressService/PlaybackService 上报失败且「错误码为网络类 且 netinfo 判定离线」时入队
 * SQLite（pending_progress）；联网恢复/回前台/冷启动/定时兜底触发 flush——
 * 按 (server_id, user_id, item_id, play_session_id) 分组、组内按 created_at_ms 升序，
 * 连续 Progress 合并为末条、Playing 保留首条、Stopped 保留末条、MarkPlayed 折叠且置于组末，
 * 组内若无 Playing 以最早事件位置合成一条先行上报（服务器按上报建立设备会话）。
 * 成功一组删一组；任一步失败即停，剩余行留待下次触发。补报同时同步本地快照 user_position_ms。
 */
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { createAdapter } from '@/adapter';
import { OFFLINE_FLUSH_RETRY_INTERVAL_MS } from '@/constant/download';
import type { DownloadDao, PendingProgressRow } from '@/infra/db';
import { getDownloadDao } from '@/infra/db';
import { AppError } from '@/infra/error';
import { getToken } from '@/infra/tokenVault';
import { useAccountStore } from '@/store/accountStore';
import { useDownloadStore } from '@/store/downloadStore';

/** 离线进度事件（enqueue 入参；event_type 词表 M6 文档 §4.4.1） */
export interface OfflineProgressEvent {
  serverId: string;
  userId: string;
  itemId: string;
  playSessionId: string;
  mediaSourceId: string;
  eventType: 'Playing' | 'Progress' | 'Stopped' | 'MarkPlayed';
  positionMs: number;
  isPaused?: boolean;
}

/** 可注入依赖（单测假时钟/假 DAO/假上报断言分组与顺序，M6 §6.1） */
export interface OfflineProgressDeps {
  dao?: Promise<DownloadDao> | DownloadDao;
  nowFn?: () => number;
  /** 定时兜底触发器（缺省 setTimeout；单测注入假节拍器） */
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** 上报执行（缺省按 (serverId, userId) 构造 adapter 实例逐事件上报；单测注入记录调用序列） */
  report?: (row: PendingProgressRow) => Promise<void>;
  /** 是否离线（缺省消费 netinfo 缓存态；单测注入固定值） */
  isOffline?: () => boolean;
}

/** 组 key（M6 文档 §4.5：按 (server_id, user_id, item_id, play_session_id) 分组） */
function groupKeyOf(row: PendingProgressRow): string {
  return `${row.serverId}|${row.userId}|${row.itemId}|${row.playSessionId}`;
}

/** 网络类错误判定（M6 §4.5 入队条件之一：错误码为网络类） */
export function isNetworkErrorCode(error: unknown): boolean {
  return error instanceof AppError && error.code === 'NETWORK_UNREACHABLE';
}

/**
 * 入队双条件纯函数（M6 §4.5）：网络类错误 且 离线。
 * 误入队（captive portal 等假阳性）由联网后 flush 正常补报，语义无损（M6 §7 风险表）。
 */
export function shouldEnqueueOnFailure(error: unknown, isOffline: boolean): boolean {
  return isNetworkErrorCode(error) && isOffline;
}

export class OfflineProgressService {
  private readonly nowFn: () => number;

  private readonly setTimer: (fn: () => void, ms: number) => unknown;

  private readonly isOffline: () => boolean;

  private readonly reportFn: NonNullable<OfflineProgressDeps['report']>;

  private readonly daoPromise: Promise<DownloadDao>;

  /** flush 重入互斥（触发源多，单轮未完成时忽略新触发） */
  private flushing = false;

  constructor(deps?: OfflineProgressDeps) {
    this.nowFn = deps?.nowFn ?? Date.now;
    this.setTimer =
      deps?.setTimer ??
      ((fn, ms) => {
        return setTimeout(fn, ms);
      });
    this.isOffline =
      deps?.isOffline ??
      (() => {
        // 同步签名下取 netinfo 最近一次缓存态（installFlushTriggers 订阅维护）
        return lastKnownOffline;
      });
    this.reportFn =
      deps?.report ??
      (async (row) => {
        const adapter = await buildAdapterFor(row.serverId, row.userId);
        const args = {
          itemId: row.itemId,
          playSessionId: row.playSessionId,
          mediaSourceId: row.mediaSourceId,
          positionMs: row.positionMs,
        };
        if (row.eventType === 'Playing') {
          await adapter.reportPlaying(args);
        } else if (row.eventType === 'Progress') {
          await adapter.reportProgress({ ...args, isPaused: row.isPaused ?? false });
        } else if (row.eventType === 'Stopped') {
          await adapter.reportStopped(args);
        } else {
          await adapter.markPlayed(row.userId, row.itemId);
        }
      });
    this.daoPromise =
      deps?.dao !== undefined ? Promise.resolve(deps.dao) : getDownloadDao();
  }

  /** 入队（event_type 含 Playing/Progress/Stopped/MarkPlayed；created_at_ms 自增有序） */
  async enqueue(event: OfflineProgressEvent): Promise<void> {
    const dao = await this.daoPromise;
    await dao.appendPendingProgress({ ...event, createdAtMs: this.nowFn() });
    // 本地快照同步（M6 §4.5 第 5 条）：离线播放期间每节流窗口同时更新 downloads.user_position_ms
    // （与入队并行做，本地断点即时可见）；非下载条目 UPDATE 零命中无副作用
    if (event.eventType !== 'MarkPlayed') {
      await this.syncLocalPosition(event.serverId, event.itemId, event.positionMs);
    }
  }

  /** 本地快照位置同步（下载行存在时更新；store 镜像一并刷新；PlaybackService.finish 收口消费） */
  async syncLocalPosition(serverId: string, itemId: string, positionMs: number): Promise<void> {
    try {
      const dao = await this.daoPromise;
      const row = await dao.getDownload(serverId, itemId);
      if (row !== null) {
        await dao.updateLocalPlayback(serverId, itemId, { userPositionMs: positionMs });
        useDownloadStore.getState().updateLocalPlayback(itemId, { userPositionMs: positionMs });
      }
    } catch {
      // 快照同步失败不阻塞入队主链路
    }
  }

  /**
   * 触发式补报：netinfo 恢复在线 + App 回前台 + 冷启动（rehydrate 完成后若在线立即执行一轮，
   * 覆盖进程被杀期间积压）+ 定时兜底（OFFLINE_FLUSH_RETRY_INTERVAL_MS，仅进程内存活有效）。
   * 成功一组删一组；任一步失败即停，剩余行留待下次触发。
   */
  async flush(): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      const dao = await this.daoPromise;
      const allRows = await dao.listAllPendingProgress();
      if (allRows.length === 0) {
        return;
      }
      // 分组（保持 created_at_ms 升序的整体顺序：组间按组内最早事件排序）
      const groups = new Map<string, PendingProgressRow[]>();
      allRows.forEach((row) => {
        const key = groupKeyOf(row);
        const list = groups.get(key);
        if (list === undefined) {
          groups.set(key, [row]);
        } else {
          list.push(row);
        }
      });
      for (const rows of groups.values()) {
        const replayList = mergeGroupForReplay(rows);
        for (const row of replayList) {
          await this.reportFn(row);
        }
        // 该组全部成功 → 删除组内行
        await dao.deletePendingProgress(rows.map((row) => row.id));
      }
    } catch (err) {
      // 中途失败即停（本轮剩余组保留），留待下次触发
      console.warn('[离线补报] 本轮中断:', err instanceof Error ? err.message : '');
    } finally {
      this.flushing = false;
    }
  }

  /** 本地已看标记（PlaybackService.finish 兜底判定成功后调用，含 MarkPlayed 入队） */
  async markLocalPlayed(serverId: string, itemId: string): Promise<void> {
    try {
      const dao = await this.daoPromise;
      const row = await dao.getDownload(serverId, itemId);
      if (row !== null) {
        await dao.updateLocalPlayback(serverId, itemId, { userPlayed: true });
        useDownloadStore.getState().updateLocalPlayback(itemId, { userPlayed: true });
      }
    } catch {
      // 吞错
    }
  }

  /** 是否离线（入队双条件判定消费；缓存态由 installFlushTriggers 订阅维护） */
  isCurrentlyOffline(): boolean {
    return this.isOffline();
  }

  /**
   * 安装触发器（App 启动后调用一次）：netinfo 恢复在线 + App 回前台 + 定时兜底。
   * 冷启动触发由调用方在 rehydrate 后直接 flush()（在线则空转退出，离线由 flush 内 rows 非空
   * + 上报失败自然保留）。
   */
  installFlushTriggers(): void {
    // netinfo：恢复在线即触发一轮（离线期间积压的行）并维护缓存态
    NetInfo.addEventListener((state) => {
      lastKnownOffline = !(state.isConnected === true && state.isInternetReachable !== false);
      if (!lastKnownOffline) {
        void this.flush();
      }
    });
    // App 回前台触发（冷启动积压 + 服务器恢复可达）
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void this.flush();
      }
    });
    // 定时兜底（仅进程内存活有效；空队列时为廉价空转）
    const tick = (): void => {
      void this.flush();
      this.setTimer(tick, OFFLINE_FLUSH_RETRY_INTERVAL_MS);
    };
    this.setTimer(tick, OFFLINE_FLUSH_RETRY_INTERVAL_MS);
  }
}

/** netinfo 最近一次离线态缓存（installFlushTriggers 订阅维护；初值按在线假设） */
let lastKnownOffline = false;

/** 离线态注入（仅测试消费：enqueueOnReportFailure 双条件的离线侧无 netinfo 原生环境） */
export function setOfflineStateForTest(offline: boolean): void {
  lastKnownOffline = offline;
}

/** 上报失败双条件入口（ProgressService/PlaybackService 共用）：网络类错误 且 netinfo 离线 */
export async function enqueueOnReportFailure(
  error: unknown,
  event: OfflineProgressEvent
): Promise<void> {
  if (!shouldEnqueueOnFailure(error, offlineProgressService.isCurrentlyOffline())) {
    return;
  }
  await offlineProgressService.enqueue(event);
}

/**
 * 组内事件序列化（M6 文档 §4.5 补报算法第 2/3 条）：
 * - 连续多条 Progress 合并为最后一条（服务器只认最终位置，语义等价）；
 * - Playing 保留首条、Stopped 保留末条，永不合并丢弃；
 * - MarkPlayed 幂等，折叠为一条且置于组末 Stopped 之后；
 * - 组内若无 Playing，以最早事件的位置合成一条先行上报（保证服务器存在该会话记录）。
 */
export function mergeGroupForReplay(rows: PendingProgressRow[]): PendingProgressRow[] {
  const ordered = [...rows].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id);
  const firstPlaying = ordered.find((row) => row.eventType === 'Playing');
  const lastStopped = [...ordered].reverse().find((row) => row.eventType === 'Stopped');
  const markPlayed = ordered.filter((row) => row.eventType === 'MarkPlayed');
  // 连续 Progress 段折叠为段末（服务器只认最终位置）
  const progressList: PendingProgressRow[] = [];
  let previousWasProgress = false;
  ordered.forEach((row) => {
    if (row.eventType !== 'Progress') {
      previousWasProgress = false;
      return;
    }
    if (previousWasProgress && progressList.length > 0) {
      progressList[progressList.length - 1] = row;
      return;
    }
    progressList.push(row);
    previousWasProgress = true;
  });
  const replayList: PendingProgressRow[] = [];
  if (firstPlaying !== undefined) {
    replayList.push(firstPlaying);
  } else if (ordered.length > 0) {
    // 无 Playing：以最早事件位置合成一条（客户端生成会话号，上报先建会话，M6 §4.5 关键决策）
    replayList.push({ ...ordered[0], eventType: 'Playing', isPaused: undefined });
  }
  replayList.push(...progressList);
  if (lastStopped !== undefined) {
    replayList.push(lastStopped);
  }
  // MarkPlayed 折叠为一条（幂等），置于 Stopped 之后
  if (markPlayed.length > 0) {
    replayList.push(markPlayed[markPlayed.length - 1]);
  }
  return replayList;
}

/** 按 (serverId, userId) 构造 adapter 实例（不要求该服务器为当前活跃账号；M6 §3.1 工厂签名） */
async function buildAdapterFor(serverId: string, userId: string) {
  const state = useAccountStore.getState();
  const server = state.servers.find((item) => item.serverId === serverId);
  if (server === undefined) {
    // 服务器记录已被删除：无法上报（行由调用方保留至下轮；服务器级联清理不在本服务职责内）
    throw new AppError('UNKNOWN');
  }
  const token = await getToken(serverId, userId);
  return createAdapter({ baseUrl: server.baseUrl, flavor: server.flavor, token });
}

/** 全局单例（触发器与队列生命周期同 App） */
export const offlineProgressService = new OfflineProgressService();
