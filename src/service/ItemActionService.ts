/**
 * 条目运维服务（M8 增量）：库页长按菜单的删除动作。
 * 删除为服务器侧操作，需要当前用户具备删除权限；无权限时服务器 403 由错误归一化抛出。
 */
import { getActiveAdapter } from '@/service/adapterProvider';

export class ItemActionService {
  /** 删除服务器条目：DELETE /Items/{itemId}（Emby/Jellyfin 同构） */
  async deleteItem(itemId: string): Promise<void> {
    await getActiveAdapter().deleteItem(itemId);
  }
}

/** 全局单例 */
export const itemActionService = new ItemActionService();
