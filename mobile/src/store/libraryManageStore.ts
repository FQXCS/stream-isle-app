/**
 * 媒体管理本地覆盖（持久化，MMKV）：按「serverId:userId」记住媒体库显隐与顺序。
 * 保存即落盘作为本机显示真源——部分服务器（如 Emby RYM）持久化 MyMediaExcludes 但不下发应用，
 * 显隐必须由本地兜底；服务器回写仅作跨客户端尽力同步。
 * 仅浏览偏好，不含敏感数据；账号删除不级联清理（键含 serverId，重登后仍可用）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { LIBRARY_MANAGE_STORE_KEY } from '@/constant/storage';
import { createMmkvJSONStorage } from '@/infra/storage';

/** 单账号的媒体库显隐/顺序覆盖 */
export interface LibraryManageOverride {
  /** 全量库 id 顺序（含隐藏库，管理页拖拽产出） */
  orderedIdList: string[];
  /** 隐藏的库 id 列表 */
  hiddenIdList: string[];
}

interface LibraryManageActions {
  /** 写入某账号的覆盖（管理页保存时调用，随 persist 落盘） */
  setOverride(key: string, override: LibraryManageOverride): void;
}

interface LibraryManageState {
  /** 键 = librariesKeyOf(serverId, userId) */
  overrideByKey: Record<string, LibraryManageOverride>;
  actions: LibraryManageActions;
}

export const useLibraryManageStore = create<LibraryManageState>()(
  persist(
    (set) => ({
      overrideByKey: {},
      actions: {
        setOverride: (key: string, override: LibraryManageOverride) =>
          set((state) => ({ overrideByKey: { ...state.overrideByKey, [key]: override } })),
      },
    }),
    {
      name: LIBRARY_MANAGE_STORE_KEY,
      storage: createMmkvJSONStorage(),
      // 只持久化数据字段（actions 为函数，不进快照）
      partialize: (state) => ({ overrideByKey: state.overrideByKey }),
    }
  )
);