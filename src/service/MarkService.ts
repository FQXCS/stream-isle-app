/**
 * 标记服务（M2 文档 §4.5）：已看标记（收藏方法 M4 补充）。
 * M2 只落 setPlayed；04 文档已确认「标记已看按钮 M2 已交付（A9），M4 回归」。
 */
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 MarkService');
  }
  return active.userId;
}

export class MarkService {
  /**
   * 标记/取消已看：true → POST /Users/{uid}/PlayedItems/{itemId}；false → DELETE。
   * 供详情页手动按钮与集列表勾 toggle 调用（≥95% 兜底标记走 PlaybackService.finish 内部逻辑）。
   */
  async setPlayed(itemId: string, played: boolean): Promise<void> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    if (played) {
      await adapter.markPlayed(userId, itemId);
    } else {
      await adapter.unmarkPlayed(userId, itemId);
    }
  }

  /**
   * 收藏/取消收藏（04 §4.4 新增）：true → POST /Users/{uid}/FavoriteItems/{itemId}；
   * false → DELETE。供详情页收藏按钮与海报墙收藏筛选联动调用。
   */
  async setFavorite(itemId: string, favorite: boolean): Promise<void> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    if (favorite) {
      await adapter.markFavorite(userId, itemId);
    } else {
      await adapter.unmarkFavorite(userId, itemId);
    }
  }

  /** 查询条目收藏态（迷你条队列仅剩当前曲时的收藏按钮） */
  async isFavorite(itemId: string): Promise<boolean> {
    const adapter = getActiveAdapter();
    return adapter.getItemFavorite(requireUserId(), itemId);
  }
}

/** 全局单例 */
export const markService = new MarkService();
