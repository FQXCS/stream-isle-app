/**
 * 通用分页加载 hook（音乐区/文件夹区共用；原 MusicLibraryScreen 内部实现抽出复用）：
 * 切换区即重置、滚动到底追加、refresh 可等待供下拉刷新、retry 供错误态重试。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { AppError, type AppErrorCode } from '@/infra/error';

/** 分页加载状态（页面局部，不进 browseStore——M5 文档 §4.7「browseStore 无需变更」） */
export interface PagedState<T> {
  itemList: T[];
  total: number;
  /** 已加载页码（0 起；-1 = 尚未加载） */
  page: number;
  loading: boolean;
  errorCode: AppErrorCode | null;
}

function initialPaged<T>(): PagedState<T> {
  return { itemList: [], total: 0, page: -1, loading: true, errorCode: null };
}

/** 通用分页加载 hook（切换区即重置；滚动到底自动追加；refresh 可等待供下拉刷新） */
export function usePagedLoad<T extends { id: string }>(
  loadPage: (page: number) => Promise<{ items: T[]; total: number }>
): PagedState<T> & {
  loadMore: () => void;
  refresh: () => Promise<void>;
  retry: () => void;
  /** 就地更新条目（长按菜单标记已看/收藏的乐观更新与失败回滚） */
  patchItem: (itemId: string, updater: (item: T) => T) => void;
  /** 删除成功后摘除条目 */
  removeItem: (itemId: string) => void;
} {
  const [state, setState] = useState<PagedState<T>>(initialPaged);

  const fetchPage = useCallback(
    async (page: number) => {
      setState((prev) => ({ ...prev, loading: true, errorCode: null }));
      try {
        const result = await loadPage(page);
        setState((prev) => ({
          itemList: page === 0 ? result.items : [...prev.itemList, ...result.items],
          total: result.total,
          page,
          loading: false,
          errorCode: null,
        }));
      } catch (err) {
        const code = err instanceof AppError ? err.code : 'UNKNOWN';
        setState((prev) => ({ ...prev, loading: false, errorCode: code }));
      }
    },
    [loadPage]
  );

  // 聚焦加载（与 M2 详情页同口径：页面局部 state + useFocusEffect 聚焦刷新，M5 §4.7）
  useFocusEffect(
    useCallback(() => {
      void fetchPage(0);
    }, [fetchPage])
  );

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (
        prev.loading ||
        prev.errorCode !== null ||
        prev.page < 0 ||
        prev.itemList.length >= prev.total
      ) {
        return prev;
      }
      void fetchPage(prev.page + 1);
      return { ...prev, loading: true };
    });
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    await fetchPage(0);
  }, [fetchPage]);

  const retry = useCallback(() => {
    void fetchPage(0);
  }, [fetchPage]);

  const patchItem = useCallback((itemId: string, updater: (item: T) => T) => {
    setState((prev) => ({
      ...prev,
      itemList: prev.itemList.map((item) => (item.id === itemId ? updater(item) : item)),
    }));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setState((prev) => ({
      ...prev,
      itemList: prev.itemList.filter((item) => item.id !== itemId),
      total: Math.max(0, prev.total - 1),
    }));
  }, []);

  return { ...state, loadMore, refresh, retry, patchItem, removeItem };
}
