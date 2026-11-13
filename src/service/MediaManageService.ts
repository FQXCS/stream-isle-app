/**
 * 媒体管理服务：媒体库显隐/顺序的读取与保存。
 * 读取：全量库（includeHidden）+ 本地覆盖优先，缺省读服务器 UserConfiguration。
 * 保存：本地覆盖立即落盘（本机真源，兜底服务器不应用 MyMediaExcludes 的情况），
 * 再尽力全量回写服务器配置做跨客户端同步；同步失败不阻塞保存。
 */
import type { MediaLibrary } from '@/adapter/model';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';
import { librariesKeyOf } from '@/store/browseStore';
import { useLibraryManageStore } from '@/store/libraryManageStore';
import { orderLibraries } from '@/util/libraryManage';

/** 管理页初始状态：全量库（含隐藏）按生效顺序排好 + 隐藏 id 列表 */
export interface ManageState {
  orderedLibraryList: MediaLibrary[];
  hiddenIdList: string[];
}

/** 读取管理页状态：本地覆盖优先；无覆盖时读服务器 OrderedViews/MyMediaExcludes */
export async function fetchManageState(): Promise<ManageState> {
  const active = useAccountStore.getState().active;
  if (!active) {
    // 与 BrowseService 同层级的时序断言（UI 路由守卫应已拦截）
    throw new Error('时序错误：无活跃账号时不应调用 fetchManageState()');
  }
  const adapter = getActiveAdapter();
  const libraryList = await adapter.getUserViews(active.userId, true);
  const override =
    useLibraryManageStore.getState().overrideByKey[librariesKeyOf(active.serverId, active.userId)];
  if (override !== undefined) {
    return {
      orderedLibraryList: orderLibraries(libraryList, override.orderedIdList),
      hiddenIdList: override.hiddenIdList,
    };
  }
  const config = await adapter.getUserConfiguration(active.userId);
  return {
    orderedLibraryList: orderLibraries(libraryList, config.OrderedViews ?? []),
    hiddenIdList: config.MyMediaExcludes ?? [],
  };
}

/**
 * 保存显隐/顺序：先写本地覆盖立即生效，再尽力回写服务器（先 GET 全量再改两字段）。
 * 返回服务器同步是否成功（失败时调用方提示「仅本机生效」）。
 */
export async function saveManageState(
  orderedIdList: string[],
  hiddenIdList: string[]
): Promise<boolean> {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 saveManageState()');
  }
  useLibraryManageStore
    .getState()
    .actions.setOverride(librariesKeyOf(active.serverId, active.userId), {
      orderedIdList,
      hiddenIdList,
    });
  try {
    const adapter = getActiveAdapter();
    const config = await adapter.getUserConfiguration(active.userId);
    await adapter.updateUserConfiguration(active.userId, {
      ...config,
      OrderedViews: orderedIdList,
      MyMediaExcludes: hiddenIdList,
    });
    return true;
  } catch {
    // 服务器不支持/网络失败：本地覆盖已生效，不阻塞保存
    return false;
  }
}