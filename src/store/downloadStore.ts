/**
 * 下载任务内存投影 store（M6 文档 §4.4.4）：SQLite 是唯一事实来源，本 store 是其内存镜像。
 * 不持久化（无 persist 包装）——rehydrate/切服务器时以 DAO 整体刷新（replaceAll）。
 * 高频进度仅 updateProgress（内存，节流 500ms 驱动 UI），状态迁移由 DownloadService 落库后同步。
 * taskMap 以 itemId 为 key（当前活跃服务器域；下载页仅展示当前活跃服务器的条目）。
 */
import { create } from 'zustand';

/** 下载任务 UI 形态（06 文档 §4.4.4 DownloadTaskUi） */
export interface DownloadTaskUi {
  itemId: string;
  title: string;
  subtitle?: string;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  progressBytes: number;
  /** totalBytes 取 MediaSource.sizeBytes 或下载回调期望值 */
  totalBytes?: number;
  posterFileUri?: string;
  mediaFileUri?: string;
  userPositionMs: number;
  /** 本地已看标记（离线续播判定 played → 不弹续播） */
  userPlayed: boolean;
  errorMessage?: string;
}

interface DownloadStoreState {
  /** key: itemId（当前活跃服务器域） */
  taskMap: Record<string, DownloadTaskUi>;
  /** 下载页头部占用统计（completed 求和） */
  totalCompletedBytes: number;
  /** rehydrate/切服务器时整体刷新 */
  replaceAll(taskList: DownloadTaskUi[]): void;
  upsertTask(task: DownloadTaskUi): void;
  /** 高频，仅内存（不触发任何持久化） */
  updateProgress(itemId: string, progressBytes: number): void;
  updateStatus(itemId: string, status: DownloadTaskUi['status'], errorMessage?: string): void;
  /** 本地播放断点/已看标记镜像（OfflineProgressService/PlaybackService 写入） */
  updateLocalPlayback(itemId: string, patch: { userPositionMs?: number; userPlayed?: boolean }): void;
  removeTask(itemId: string): void;
}

/** completed 占用求和（replaceAll/upsert/remove 后重算） */
function sumCompleted(taskMap: Record<string, DownloadTaskUi>): number {
  return Object.values(taskMap).reduce(
    (total, task) => (task.status === 'completed' ? total + task.progressBytes : total),
    0
  );
}

export const useDownloadStore = create<DownloadStoreState>()((set) => ({
  taskMap: {},
  totalCompletedBytes: 0,

  replaceAll: (taskList) => {
    set(() => {
      const taskMap: Record<string, DownloadTaskUi> = {};
      taskList.forEach((task) => {
        taskMap[task.itemId] = task;
      });
      return { taskMap, totalCompletedBytes: sumCompleted(taskMap) };
    });
  },

  upsertTask: (task) => {
    set((state) => {
      const taskMap = { ...state.taskMap, [task.itemId]: task };
      return { taskMap, totalCompletedBytes: sumCompleted(taskMap) };
    });
  },

  updateProgress: (itemId, progressBytes) => {
    set((state) => {
      const existing = state.taskMap[itemId];
      if (existing === undefined) {
        return state;
      }
      return {
        taskMap: { ...state.taskMap, [itemId]: { ...existing, progressBytes } },
      };
    });
  },

  updateStatus: (itemId, status, errorMessage) => {
    set((state) => {
      const existing = state.taskMap[itemId];
      if (existing === undefined) {
        return state;
      }
      const taskMap = {
        ...state.taskMap,
        [itemId]: { ...existing, status, errorMessage },
      };
      return { taskMap, totalCompletedBytes: sumCompleted(taskMap) };
    });
  },

  updateLocalPlayback: (itemId, patch) => {
    set((state) => {
      const existing = state.taskMap[itemId];
      if (existing === undefined) {
        return state;
      }
      return {
        taskMap: {
          ...state.taskMap,
          [itemId]: { ...existing, ...patch },
        },
      };
    });
  },

  removeTask: (itemId) => {
    set((state) => {
      if (state.taskMap[itemId] === undefined) {
        return state;
      }
      const taskMap = { ...state.taskMap };
      delete taskMap[itemId];
      return { taskMap, totalCompletedBytes: sumCompleted(taskMap) };
    });
  },
}));
