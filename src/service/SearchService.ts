/**
 * 搜索服务（04 文档 §4.3）：关键词搜索，经 adapter 按类型三请求分组。
 * 服务层不直接发请求，一律经 adapter（设计文档 §4）。
 */
import type { SearchResultGroup } from '@/adapter/model';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

/** 取活跃 userId（UI 路由守卫保证有活跃账号；缺席位属时序编程错误，直接断言抛出） */
function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 SearchService');
  }
  return active.userId;
}

export class SearchService {
  /**
   * 关键词搜索：adapter.search 按类型并发三次（电影/剧集/人物，每组限额 12），
   * 返回剔除空组后的分组列表（组内保持服务器返回序）。
   */
  async search(term: string): Promise<SearchResultGroup[]> {
    const adapter = getActiveAdapter();
    return adapter.search(requireUserId(), term);
  }
}

/** 全局单例 */
export const searchService = new SearchService();
