/**
 * 账号 store：多服务器多用户 + 全局唯一活跃账号（M1 文档 §4.8；设计文档 §5.2/§9；04 §4.7 终态）。
 * persist：mmkvStorage，key "account-store"。
 * ServerUser 无 token 字段：Token 不进 MMKV（仅 expo-secure-store + 内存，§4.5.3）。
 * 04 收口：switchActiveUser（复位 401 失效标志）/ expireActiveUser（幂等登出 + sessionExpired
 * 失效标志）/ removeServer 级联清理（token + 白名单 + 浏览缓存）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ServerFlavor, ServerInfo, AuthResult } from '@/adapter/model';
import { ACCOUNT_STORE_KEY } from '@/constant/storage';
import { createMmkvJSONStorage } from '@/infra/storage';
import { deleteToken, warmupToken } from '@/infra/tokenVault';
import { deletePassword } from '@/infra/credentialVault';
import { useBrowseStore } from '@/store/browseStore';
import { useSettingsStore } from '@/store/settingsStore';

/** 服务器下的用户记录（无 token 字段，引用键由 `token_{serverId}_{userId}` 推导） */
export interface ServerUser {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

/** 服务器线路（主线路固定排在 routes[0]，其余为备用线路；baseUrl 为规范化完整地址） */
export interface ServerRoute {
  id: string;
  name: string;
  baseUrl: string;
}

/** 服务器数量统计（「刷新详情数据」时拉取并缓存） */
export interface ServerMediaStats {
  movieCount: number;
  seriesCount: number;
  /** 最近刷新时间（ms） */
  refreshedAt: number;
}

/** 服务器账号记录（与设计文档 §9 servers 模型对齐） */
export interface ServerAccount {
  /** 本地记录 id，取上游 serverId（与 serverId 同值，保留两字段以对齐 §9 模型） */
  id: string;
  baseUrl: string;
  flavor: ServerFlavor;
  serverId: string;
  /** 上游服务器 Id（同 IP 重复添加时本地 serverId 会加序号去重，上游 id 仅用于探测校验/QC 匹配） */
  upstreamServerId?: string;
  serverName: string;
  version: string;
  /** List 结尾命名 */
  users: ServerUser[];
  activeUserId: string | null;
  /** 线路列表（旧记录无该字段时按 baseUrl 合成「默认线路」） */
  routes?: ServerRoute[];
  /** 当前线路 id（缺省取 routes[0]） */
  activeRouteId?: string | null;
  /** 隐私服务器：首页切换器隐藏 + 卡片信息打码 */
  private?: boolean;
  /** 最近使用时间（ms，相对时间展示） */
  lastUsedAt?: number;
  /** 数量统计缓存（进入页面直接显示，点「刷新详情数据」重拉） */
  stats?: ServerMediaStats;
}

/** 读取线路列表：旧记录无 routes 时按 baseUrl 合成默认线路（不做写迁移） */
export function routesOf(server: ServerAccount): ServerRoute[] {
  if (server.routes !== undefined && server.routes.length > 0) {
    return server.routes;
  }
  return [{ id: 'primary', name: '默认线路', baseUrl: server.baseUrl }];
}

/** 当前线路 id（无效 id 回退 routes[0]） */
export function activeRouteIdOf(server: ServerAccount): string {
  const routeList = routesOf(server);
  return routeList.some((route) => route.id === server.activeRouteId)
    ? (server.activeRouteId as string)
    : routeList[0].id;
}

/** 上游服务器 Id（旧记录无 upstreamServerId 时即本地 serverId） */
export function upstreamServerIdOf(server: ServerAccount): string {
  return server.upstreamServerId ?? server.serverId;
}

/**
 * 为「添加服务器」分配本地唯一 id：同一台服务器（上游 id 相同）重复添加时
 * 不再合并到已有记录，而是依次生成 `${upstreamId}-2`、`${upstreamId}-3`…
 * 后缀用 "-" 而非 "#"：secure-store 的 key 只允许字母数字与 . - _（token 键由 id 推导）。
 */
export function uniqueServerIdOf(servers: readonly ServerAccount[], upstreamId: string): string {
  const usedIds = new Set(servers.map((server) => server.serverId));
  if (!usedIds.has(upstreamId)) {
    return upstreamId;
  }
  let suffix = 2;
  while (usedIds.has(`${upstreamId}-${suffix}`)) {
    suffix += 1;
  }
  return `${upstreamId}-${suffix}`;
}

/** 活跃账号引用（全局唯一） */
export interface ActiveAccountRef {
  serverId: string;
  userId: string;
}

interface AccountActions {
  /** serverId 相同则更新 serverName/version/baseUrl，不重复建（新记录由 saveAccount 分配唯一 id） */
  upsertServer(info: ServerInfo, upstreamServerId?: string): void;
  /** 同服务器追加用户（已存在则更新资料）；单账号模型下由 replaceServerUser 覆盖 */
  upsertUser(serverId: string, auth: AuthResult): void;
  /** 单账号模型：用新账号替换该服务器下唯一账号（编辑服务器改账号密码时用） */
  replaceServerUser(serverId: string, auth: AuthResult): void;
  /**
   * 切换活跃 {serverId, userId}（04 §4.7 终态签名，M1 setActive 升级更名）：
   * 预热目标用户 Token 进内存 → 切换即整体刷新 + 复位 401 失效标志（§5.2）。
   */
  switchActiveUser(serverId: string, userId: string): Promise<void>;
  /** 清活跃标记（用户主动登出路径）：仅清活跃标记，ServerAccount 与用户记录保留 */
  clearActive(): void;
  /**
   * 401 幂等登出（04 §4.7 终态签名）：仅清活跃标记 + 置 sessionExpired 失效标志 + 写入
   * 重登服务器上下文；并发/连续 401 幂等去重（同一次登录会话仅首次生效）。
   * 标志在重新登录成功（switchActiveUser）时复位。
   */
  expireActiveUser(): void;
  /** 登出单用户（logout 用） */
  removeUser(serverId: string, userId: string): void;
  /**
   * 删除整台服务器（04 §4.7 级联清单）：① tokenVault 删除其下所有 user 的 token；
   * ② settingsStore.removeServerScopedData(server.baseUrl)（白名单清理 + 全量回同步原生）；
   * ③ browseStore 清该 serverId（含其下所有 userId）的浏览缓存（内存态，无磁盘残留）；
   * ④ 若删除的是活跃服务器：有剩余服务器则 switchActiveUser 到第一个剩余服务器的用户，
   *    无剩余保持 active=null（导航 gate 自动回 OnboardingConnect）。
   */
  removeServer(serverId: string): Promise<void>;
  /** 设置/清除 401 待重登服务器（401 事件处理器与登录页消费后调用，瞬态不入 persist） */
  setReloginServerId(serverId: string | null): void;
  /** 激活服务器（取该服务器活跃用户/首个用户；无用户返回 false，不改变 active） */
  activateServer(serverId: string): Promise<boolean>;
  /** 手动切换线路：更新 baseUrl / activeRouteId / lastUsedAt */
  setActiveRoute(serverId: string, routeId: string): void;
  /** 故障转移：按路线顺序切到下一条并返回其 baseUrl；无其它线路返回 null（供 adapter 重试） */
  advanceActiveRoute(serverId: string): string | null;
  /** 新增或更新线路 */
  upsertRoute(serverId: string, route: ServerRoute): void;
  /** 删除线路（至少保留一条；删除当前线路时回退首条） */
  removeRoute(serverId: string, routeId: string): void;
  /** 隐私服务器开关 */
  setServerPrivate(serverId: string, privateValue: boolean): void;
  /** 写入数量统计缓存（刷新详情数据） */
  setServerStats(serverId: string, stats: ServerMediaStats): void;
  /** 编辑服务器资料（名称/地址） */
  updateServerProfile(
    serverId: string,
    patch: { serverName?: string; baseUrl?: string }
  ): void;
  /** 服务器顺序（「排序」保存）：按给定 id 顺序重排，未列出的追加末尾 */
  reorderServers(orderedServerIdList: readonly string[]): void;
}

interface AccountState {
  servers: ServerAccount[];
  active: ActiveAccountRef | null;
  /** persist rehydrate 是否已完成（登录态导航 gate 依赖，§4.9） */
  hydrated: boolean;
  /** 401 待重登的服务器 id（瞬态，不持久化；导航 gate 用它决定回 Login 并携带 serverId） */
  reloginServerId: string | null;
  /** 401 登出失效标志（瞬态，不持久化；并发 401 幂等去重，重登成功/切换账号时复位，04 §4.7） */
  sessionExpired: boolean;
  actions: AccountActions;
  /** 内部：标记 rehydrate 完成（onRehydrateStorage 回调使用） */
  setHydrated(hydrated: boolean): void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      servers: [],
      active: null,
      hydrated: false,
      reloginServerId: null,
      sessionExpired: false,

      setHydrated: (hydrated: boolean) => set({ hydrated }),

      actions: {
        upsertServer: (info: ServerInfo, upstreamServerId?: string) => {
          set((state) => {
            const existing = state.servers.find((server) => server.serverId === info.serverId);
            if (existing) {
              // 重新探测/登录会刷新地址：同步写回当前线路，避免线路列表与 baseUrl 脱节
              const currentRouteId = activeRouteIdOf(existing);
              return {
                servers: state.servers.map((server) =>
                  server.serverId === info.serverId
                    ? {
                        ...server,
                        baseUrl: info.baseUrl,
                        serverName: info.serverName,
                        version: info.version,
                        lastUsedAt: Date.now(),
                        // 上游 id 一经记录不再变化（本地 id 可能带后缀）
                        upstreamServerId: server.upstreamServerId ?? upstreamServerId ?? server.serverId,
                        routes: routesOf(server).map((route) =>
                          route.id === currentRouteId
                            ? { ...route, baseUrl: info.baseUrl }
                            : route
                        ),
                      }
                    : server
                ),
              };
            }
            const account: ServerAccount = {
              id: info.serverId,
              baseUrl: info.baseUrl,
              flavor: info.flavor,
              serverId: info.serverId,
              upstreamServerId: upstreamServerId ?? info.serverId,
              serverName: info.serverName,
              version: info.version,
              users: [],
              activeUserId: null,
              routes: [{ id: 'primary', name: '默认线路', baseUrl: info.baseUrl }],
              activeRouteId: 'primary',
              lastUsedAt: Date.now(),
            };
            return { servers: [...state.servers, account] };
          });
        },

        upsertUser: (serverId: string, auth: AuthResult) => {
          set((state) => ({
            servers: state.servers.map((server) => {
              if (server.serverId !== serverId) {
                return server;
              }
              const existing = server.users.find((user) => user.userId === auth.userId);
              const userRecord: ServerUser = {
                userId: auth.userId,
                userName: auth.userName,
                avatarUrl: auth.avatarUrl,
              };
              const users = existing
                ? server.users.map((user) => (user.userId === auth.userId ? userRecord : user))
                : [...server.users, userRecord];
              return { ...server, users };
            }),
          }));
        },

        replaceServerUser: (serverId: string, auth: AuthResult) => {
          set((state) => ({
            servers: state.servers.map((server) =>
              server.serverId === serverId
                ? {
                    ...server,
                    users: [
                      { userId: auth.userId, userName: auth.userName, avatarUrl: auth.avatarUrl },
                    ],
                    activeUserId: auth.userId,
                  }
                : server
            ),
          }));
        },

        switchActiveUser: async (serverId: string, userId: string) => {
          // 目标用户 Token 预热进内存（getActiveAdapter 同步组装认证头的前提，04 §4.7）
          await warmupToken(serverId, userId);
          set((state) => ({
            active: { serverId, userId },
            // 复位 401 失效标志（重新登录成功/切换账号均为新会话，04 §4.7）
            sessionExpired: false,
            // 活跃用户同步写回所属服务器记录
            servers: state.servers.map((server) =>
              server.serverId === serverId
                ? { ...server, activeUserId: userId, lastUsedAt: Date.now() }
                : server
            ),
          }));
        },

        reorderServers: (orderedServerIdList: readonly string[]) => {
          set((state) => {
            const remaining = new Map(state.servers.map((server) => [server.serverId, server]));
            const ordered: ServerAccount[] = [];
            orderedServerIdList.forEach((serverId) => {
              const server = remaining.get(serverId);
              if (server !== undefined) {
                ordered.push(server);
                remaining.delete(serverId);
              }
            });
            remaining.forEach((server) => ordered.push(server));
            return { servers: ordered };
          });
        },

        clearActive: () => {
          set({ active: null });
        },

        expireActiveUser: () => {
          const state = get();
          // 幂等去重（04 §4.7）：同一次登录会话仅首次生效——并发 401（同一页面多请求
          // 同时失败）只触发一次登出；标志复位后（重登/切换）方可再次生效
          if (state.active === null && state.sessionExpired) {
            return;
          }
          const expiredServerId = state.active?.serverId ?? null;
          set({
            active: null,
            sessionExpired: true,
            // 重登服务器上下文：并发 401 时第二次事件读到 active 已为 null，
            // 不得以 null 覆盖先到事件留下的服务器上下文（验收「经 serverId 恢复」依赖它）
            reloginServerId: expiredServerId ?? state.reloginServerId,
          });
        },

        removeUser: (serverId: string, userId: string) => {
          set((state) => ({
            servers: state.servers.map((server) =>
              server.serverId === serverId
                ? {
                    ...server,
                    users: server.users.filter((user) => user.userId !== userId),
                    activeUserId:
                      server.activeUserId === userId
                        ? server.users.filter((user) => user.userId !== userId)[0]?.userId ?? null
                        : server.activeUserId,
                  }
                : server
            ),
          }));
        },

        removeServer: async (serverId: string) => {
          const server = get().servers.find((item) => item.serverId === serverId);
          if (server) {
            // ① 删除该服务器全部用户的 Token 与加密密码（secure-store + 内存双清）
            await Promise.all(
              server.users.map(async (user) => {
                await deleteToken(server.serverId, user.userId);
                await deletePassword(server.serverId, user.userId);
              })
            );
            // ② 白名单级联清理 + 全量回同步原生（04 §4.7 第 2 步）
            useSettingsStore.getState().actions.removeServerScopedData(server.baseUrl);
            // ③ 浏览缓存级联清理（含其下所有 userId；内存态直接清除，无磁盘残留）
            useBrowseStore.getState().actions.resetAllForServer(serverId);
          }
          const wasActive = get().active?.serverId === serverId;
          // ④ 删除的是活跃服务器：有剩余则切换到第一个剩余服务器的用户并整体刷新；
          //    无剩余保持 active=null，导航 gate 自动回 OnboardingConnect（04 §4.7 第 4 步）。
          //    先预热目标 Token 再一次性原子替换（过滤服务器 + 切换活跃 + 复位失效标志），
          //    避免先置 active=null 使导航 gate 短暂切到 guest 栈造成登录页闪屏
          if (wasActive) {
            const remainingServers = get().servers.filter((item) => item.serverId !== serverId);
            const nextServer = remainingServers[0];
            const nextUserId = nextServer?.activeUserId ?? nextServer?.users[0]?.userId;
            if (nextServer !== undefined && nextUserId !== undefined) {
              await warmupToken(nextServer.serverId, nextUserId);
              set((state) => ({
                servers: state.servers
                  .filter((item) => item.serverId !== serverId)
                  .map((item) =>
                    item.serverId === nextServer.serverId
                      ? { ...item, activeUserId: nextUserId }
                      : item
                  ),
                active: { serverId: nextServer.serverId, userId: nextUserId },
                sessionExpired: false,
              }));
              return;
            }
          }
          set((state) => ({
            servers: state.servers.filter((item) => item.serverId !== serverId),
            active: state.active?.serverId === serverId ? null : state.active,
          }));
        },

        setReloginServerId: (serverId: string | null) => {
          set({ reloginServerId: serverId });
        },

        activateServer: async (serverId: string) => {
          const server = get().servers.find((item) => item.serverId === serverId);
          const userId = server?.activeUserId ?? server?.users[0]?.userId;
          if (server === undefined || userId === undefined) {
            return false;
          }
          await get().actions.switchActiveUser(serverId, userId);
          return true;
        },

        setActiveRoute: (serverId: string, routeId: string) => {
          set((state) => ({
            servers: state.servers.map((server) => {
              if (server.serverId !== serverId) {
                return server;
              }
              const route = routesOf(server).find((item) => item.id === routeId);
              if (route === undefined) {
                return server;
              }
              return {
                ...server,
                baseUrl: route.baseUrl,
                activeRouteId: route.id,
                lastUsedAt: Date.now(),
              };
            }),
          }));
        },

        advanceActiveRoute: (serverId: string) => {
          const server = get().servers.find((item) => item.serverId === serverId);
          if (server === undefined) {
            return null;
          }
          const routeList = routesOf(server);
          if (routeList.length <= 1) {
            return null;
          }
          const currentId = activeRouteIdOf(server);
          const currentIndex = routeList.findIndex((route) => route.id === currentId);
          const next = routeList[(currentIndex + 1) % routeList.length];
          if (next === undefined || next.id === currentId) {
            return null;
          }
          get().actions.setActiveRoute(serverId, next.id);
          return next.baseUrl;
        },

        upsertRoute: (serverId: string, route: ServerRoute) => {
          set((state) => ({
            servers: state.servers.map((server) => {
              if (server.serverId !== serverId) {
                return server;
              }
              const routeList = routesOf(server);
              const exists = routeList.some((item) => item.id === route.id);
              const routes = exists
                ? routeList.map((item) => (item.id === route.id ? route : item))
                : [...routeList, route];
              const isActive = activeRouteIdOf(server) === route.id;
              return {
                ...server,
                routes,
                baseUrl: isActive ? route.baseUrl : server.baseUrl,
                activeRouteId: isActive ? route.id : server.activeRouteId,
              };
            }),
          }));
        },

        removeRoute: (serverId: string, routeId: string) => {
          set((state) => ({
            servers: state.servers.map((server) => {
              if (server.serverId !== serverId) {
                return server;
              }
              const routeList = routesOf(server);
              // 至少保留一条线路（主线路不可删空）
              if (routeList.length <= 1) {
                return server;
              }
              const routes = routeList.filter((route) => route.id !== routeId);
              if (routes.length === 0) {
                return server;
              }
              const wasActive = activeRouteIdOf(server) === routeId;
              const nextActiveId = wasActive ? routes[0].id : activeRouteIdOf(server);
              const nextRoute = routes.find((route) => route.id === nextActiveId) ?? routes[0];
              return {
                ...server,
                routes,
                activeRouteId: nextRoute.id,
                baseUrl: nextRoute.baseUrl,
              };
            }),
          }));
        },

        setServerPrivate: (serverId: string, privateValue: boolean) => {
          set((state) => ({
            servers: state.servers.map((server) =>
              server.serverId === serverId ? { ...server, private: privateValue } : server
            ),
          }));
        },

        setServerStats: (serverId: string, stats: ServerMediaStats) => {
          set((state) => ({
            servers: state.servers.map((server) =>
              server.serverId === serverId ? { ...server, stats } : server
            ),
          }));
        },

        updateServerProfile: (serverId, patch) => {
          set((state) => ({
            servers: state.servers.map((server) => {
              if (server.serverId !== serverId) {
                return server;
              }
              const currentRouteId = activeRouteIdOf(server);
              const routes =
                patch.baseUrl !== undefined
                  ? routesOf(server).map((route) =>
                      route.id === currentRouteId ? { ...route, baseUrl: patch.baseUrl as string } : route
                    )
                  : server.routes;
              return {
                ...server,
                serverName: patch.serverName ?? server.serverName,
                baseUrl: patch.baseUrl ?? server.baseUrl,
                routes,
              };
            }),
          }));
        },
      },
    }),
    {
      name: ACCOUNT_STORE_KEY,
      storage: createMmkvJSONStorage(),
      // 只持久化账号引用数据：hydrated/reloginServerId/sessionExpired 为运行时瞬态；类型上无 token 字段
      partialize: (state) => ({ servers: state.servers, active: state.active }),
      // rehydrate 完成即点亮登录态导航 gate
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

/**
 * 活跃账号选择器（语义非空）：getActiveAccount(): ServerAccount。
 * 保证方式分两层（§4.7）：UI 层路由守卫 + service 层断言——
 * 发现 null 属时序编程错误，直接以普通 Error 断言抛出（不进 AppError 归一化体系），开发期即暴露。
 */
export function getActiveAccount(): ServerAccount {
  const state = useAccountStore.getState();
  const active = state.active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 getActiveAccount()（路由守卫应已拦截）');
  }
  const server = state.servers.find((item) => item.serverId === active.serverId);
  if (!server) {
    throw new Error('时序错误：活跃 serverId 在 servers 中不存在');
  }
  return server;
}

/** 活跃服务器 flavor（UI 用；无活跃账号时回退 EMBY，实际受路由守卫保护） */
export function useActiveServerFlavor(): ServerFlavor {
  return useAccountStore((state) => {
    const active = state.active;
    if (active === null) {
      return 'EMBY';
    }
    return state.servers.find((item) => item.serverId === active.serverId)?.flavor ?? 'EMBY';
  });
}
