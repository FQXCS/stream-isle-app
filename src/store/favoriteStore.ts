/**
 * 音乐列表行收藏态覆盖：列表接口返回的 UserData 在行内切换后不会立即回写，
 * 记录本次会话内的最新值，滚动复用/切列表再回来仍显示正确心形。
 */
import { create } from 'zustand';

interface FavoriteStore {
  overrideById: Record<string, boolean>;
  setOverride(itemId: string, favorite: boolean): void;
}

export const useFavoriteStore = create<FavoriteStore>()((set) => ({
  overrideById: {},
  setOverride: (itemId, favorite) =>
    set((state) => ({ overrideById: { ...state.overrideById, [itemId]: favorite } })),
}));
