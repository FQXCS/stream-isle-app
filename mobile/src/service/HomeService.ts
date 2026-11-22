/**
 * 首页服务（M4 文档 §3 认领补齐）：三区数据一次拉齐（继续观看/下一集/最新添加），
 * 复用 adapter 既有 getResume/getNextUp/getLatest 具名封装；
 * 媒体库融合页另加「每库最新添加行」批量拉取（单库失败按空行处理）。
 */
import type { ItemFilterEnum, MediaLibraryItem } from '@/adapter/model';
import { LIBRARY_ROW_LIMIT } from '@/constant/browse';
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

/** 每库行「最新添加」查询项（条件由默认 Tab 解析，见 resolveLibraryLatestQuery） */
export interface LibraryLatestQueryItem {
  libraryId: string;
  /** 服务器 IncludeItemTypes 原值 */
  includeItemTypes: string;
  /** 服务器 Filters 原值 */
  filters?: readonly ItemFilterEnum[];
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
   * 分区级空由页面隐藏对应分区（M4 §4.2 页面状态约定）。
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

  /**
   * 每库「最新添加」行（融合页「我的媒体」下方，每库前 LIBRARY_ROW_LIMIT 条）：
   * 查询条件由调用方按库的默认 Tab 解析（条目类型 + 筛选，见 resolveLibraryLatestQuery）；
   * 在此基础上追加「未看完」（IsUnplayed）优先展示未看完的最新条目，该库无未看完条目
   * （查询结果为 0）时去掉该条件重查一次回退到全部；默认 Tab 本身就是未看筛选时不追加。
   * 并发拉取，单库失败按空行处理（隐藏该行，不阻塞整页）。
   */
  async loadLibraryLatest(
    queryList: readonly LibraryLatestQueryItem[]
  ): Promise<Record<string, MediaLibraryItem[]>> {
    const adapter = getActiveAdapter();
    const userId = requireUserId();
    const entryList = await Promise.all(
      queryList.map(async ({ libraryId, includeItemTypes, filters }): Promise<
        [string, MediaLibraryItem[]]
      > => {
        // 追加未看完筛选；默认 Tab 已含 IsUnplayed（用户配置的未看 Tab）时保持原样
        const hasUnplayed = filters?.includes('IsUnplayed') ?? false;
        const unplayedFilters: readonly ItemFilterEnum[] | undefined = hasUnplayed
          ? filters
          : [...(filters ?? []), 'IsUnplayed'];
        try {
          let itemList = await adapter.getLatestByTypes(
            userId,
            libraryId,
            includeItemTypes,
            LIBRARY_ROW_LIMIT,
            unplayedFilters
          );
          if (itemList.length === 0 && !hasUnplayed) {
            // 库内无未看完条目：去掉「未看完」条件，回退全部最新添加
            itemList = await adapter.getLatestByTypes(
              userId,
              libraryId,
              includeItemTypes,
              LIBRARY_ROW_LIMIT,
              filters
            );
          }
          return [libraryId, itemList];
        } catch {
          return [libraryId, []];
        }
      })
    );
    return Object.fromEntries(entryList);
  }
}

/** 全局单例 */
export const homeService = new HomeService();
