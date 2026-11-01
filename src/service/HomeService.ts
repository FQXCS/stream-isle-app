/**
 * 首页服务（04 文档 §3 认领补齐）：三区数据一次拉齐（继续观看/下一集/最新添加），
 * 复用 adapter 既有 getResume/getNextUp/getLatest 具名封装。
 */
import type { MediaLibraryItem } from '@/adapter/model';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';

/** 首页三区数据 */
export interface HomeSections {
  /** 继续观看（有断点条目，按最近播放序） */
  resumeList: MediaLibraryItem[];
  /** 下一集（每剧一集） */
  nextUpList: MediaLibraryItem[];
  /** 最新添加（电影/剧集按入库时间倒序） */
  latestList: MediaLibraryItem[];
}

/** 取活跃 userId（UI 路由守卫保证有活跃账号；缺席位属时序编程错误，直接断言抛出） */
function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 HomeService');
  }
  return active.userId;
}

export class HomeService {
  /**
   * 三区并发拉取（各 12 条上限）：任一失败即整页失败（页面级 ErrorView + 重试），
   * 分区级空由页面隐藏对应分区（04 §4.2 页面状态约定）。
   */
  async loadHome(): Promise<HomeSections> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    // 继续观看收录类型由设置页二级页单独配置（默认 Movie,Episode,Video）
    const includeItemTypes = useSettingsStore.getState().resumeTypeList;
    const [resumeList, nextUpList, latestList] = await Promise.all([
      adapter.getResume(userId, includeItemTypes),
      adapter.getNextUp(userId),
      adapter.getLatest(userId),
    ]);
    return { resumeList, nextUpList, latestList };
  }
}

/** 全局单例 */
export const homeService = new HomeService();
