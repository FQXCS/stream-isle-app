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
import { useBrowseStore } from '@/store/browseStore';
import { useSettingsStore } from '@/store/settingsStore';

/** 服务器下的用户记录（无 token 字段，引用键由 `token_{serverId}_{userId}` 推导） */
export interface ServerUser {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

/** 服务器账号记录（与设计文档 §9 servers 模型对齐） */
export interface ServerAccount {
  /** 本地记录 id，取上游 serverId（与 serverId 同值，保留两字段以对齐 §9 模型） */
  id: string;
  baseUrl: string;
  flavor: ServerFlavor;
  serverId: string;
  serverName: string;
  version: string;
  /** List 结尾命名 */
  users: ServerUser[];
  activeUserId: string | null;
}

/** 活跃账号引用（全局唯一） */
export interface ActiveAccountRef {
  serverId: string;
  userId: string;
}

interface AccountActions {
  /** serverId 相同则更新 serverName/version/baseUrl，不重复建 */
  upsertServer(info: ServerInfo): void;
  /** 同服务器追加用户（已存在则更新资料），不覆盖已有用户 */
  upsertUser(serverId: string, auth: AuthResult): void;
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
        upsertServer: (info: ServerInfo) => {
          set((state) => {
            const existing = state.servers.find((server) => server.serverId === info.serverId);
            if (existing) {
              return {
                servers: state.servers.map((server) =>
                  server.serverId === info.serverId
                    ? { ...server, baseUrl: info.baseUrl, serverName: info.serverName, version: info.version }
                    : server
                ),
              };
            }
            const account: ServerAccount = {
              id: info.serverId,
              baseUrl: info.baseUrl,
              flavor: info.flavor,
              serverId: info.serverId,
              serverName: info.serverName,
              version: info.version,
              users: [],
              activeUserId: null,
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

        switchActiveUser: async (serverId: string, userId: string) => {
          // 目标用户 Token 预热进内存（getActiveAdapter 同步组装认证头的前提，04 §4.7）
          await warmupToken(serverId, userId);
          set((state) => ({
            active: { serverId, userId },
            // 复位 401 失效标志（重新登录成功/切换账号均为新会话，04 §4.7）
            sessionExpired: false,
            // 活跃用户同步写回所属服务器记录
            servers: state.servers.map((server) =>
              server.serverId === serverId ? { ...server, activeUserId: userId } : server
            ),
          }));
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
            // ① 删除该服务器全部用户的 Token（secure-store + 内存双清）
            await Promise.all(
              server.users.map((user) => deleteToken(server.serverId, user.userId))
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
