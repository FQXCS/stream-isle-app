/**
 * 认证服务（M1 文档 §4.7）：地址探测 / 登录 / 存账号 / 登出。
 * 服务层不直接发请求，一律经 adapter（设计文档 §4）。
 */
import { createAdapter } from '@/adapter';
import type { AuthResult, QuickConnectSession, ServerInfo } from '@/adapter/model';
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import {
  QUICK_CONNECT_POLL_INTERVAL_MS,
  QUICK_CONNECT_TIMEOUT_MS,
} from '@/constant/auth';
import { normalizeAddress } from '@/util/normalizeUrl';
import { AppError } from '@/infra/error';
import { deleteToken, saveToken, warmupToken } from '@/infra/tokenVault';
import { deletePassword, getPassword } from '@/infra/credentialVault';
import { probeTls } from '@/infra/tlsBypass';
import type { TlsProbeResult } from '@/infra/tlsBypass';
import { useAccountStore, uniqueServerIdOf, upstreamServerIdOf } from '@/store/accountStore';

export type { TlsProbeResult };

/**
 * 原生 probe 封装（src/infra/tlsBypass.ts，M4 收口更名）；导出供 connect 与重试逻辑复用。
 */
export function probeUrl(url: string): Promise<TlsProbeResult> {
  return probeTls(url);
}

/**
 * 连接探测：normalizeAddress（返回 null → 抛 AppError("INVALID_ADDRESS")，该码的唯一生产转换点）
 * → createAdapter(无 token).probe()；probe 网络层失败时经原生 probeTls 细分：
 * TLS_FAIL → 抛 AppError("TLS_ERROR")，否则保留 NETWORK_UNREACHABLE
 * （TLS_ERROR 唯一生产者，§4.5.2）——页面只按 AppErrorCode 分态，不自行调 probe（§4.10）。
 */
export async function connect(rawUrl: string): Promise<ServerInfo> {
  const baseUrl = normalizeAddress(rawUrl);
  if (baseUrl === null) {
    throw new AppError('INVALID_ADDRESS');
  }
  // 探测阶段 flavor 未定：placeholder 用 JELLYFIN 创建（probe 的 flavor 判定来自 ProductName，
  // 与 placeholder 无关）；设备认证头以标准 Authorization 发送，Emby 4.x 同样接受该头
  const adapter = createAdapter({ baseUrl, flavor: 'JELLYFIN' });
  try {
    return await adapter.probe();
  } catch (err) {
    if (err instanceof AppError && err.code === 'NETWORK_UNREACHABLE') {
      // TLS 细分唯一机制：原生 probe 精确区分证书问题与真不可达（§4.5.4）
      const tlsResult = await probeUrl(baseUrl);
      if (tlsResult === 'TLS_FAIL') {
        throw new AppError('TLS_ERROR', { cause: err });
      }
      throw new AppError('NETWORK_UNREACHABLE', { cause: err });
    }
    throw err;
  }
}

/**
 * 登录：按探测得到的 ServerInfo 构造 adapter，POST /Users/AuthenticateByName。
 */
export async function login(
  info: ServerInfo,
  username: string,
  password: string
): Promise<AuthResult> {
  const adapter = createAdapter({ baseUrl: info.baseUrl, flavor: info.flavor });
  return adapter.login(username, password);
}

/**
 * 存账号：目标记录 id = 传入 recordId（已有服务器追加账号）或按上游 id 分配新的本地唯一 id
 * （同一台服务器重复添加会生成新卡片，不自动合并）→ saveToken → upsertServer → upsertUser → 激活。
 * 探测 Id 缺省时用登录响应 ServerId 补。
 */
export async function saveAccount(
  info: ServerInfo,
  auth: AuthResult,
  recordId?: string
): Promise<string> {
  const upstreamId = info.serverId !== '' ? info.serverId : auth.serverId;
  const store = useAccountStore.getState();
  const localId = recordId ?? uniqueServerIdOf(store.servers, upstreamId);
  const mergedInfo: ServerInfo = { ...info, serverId: localId };
  await saveToken(localId, auth.userId, auth.token);
  store.actions.upsertServer(mergedInfo, upstreamId);
  if (recordId !== undefined) {
    // 单账号模型：一个服务器只保留一组账号密码，重登/改账号时替换而非追加
    const oldUserList = store.servers.find((server) => server.serverId === recordId)?.users ?? [];
    await Promise.all(
      oldUserList
        .filter((user) => user.userId !== auth.userId)
        .map(async (user) => {
          await deleteToken(recordId, user.userId);
          await deletePassword(recordId, user.userId);
        })
    );
    store.actions.replaceServerUser(localId, auth);
  } else {
    store.actions.upsertUser(localId, auth);
  }
  await store.actions.switchActiveUser(localId, auth.userId);
  return localId;
}

/**
 * 登出（M4 §4.5 设置页行为）：deleteToken + removeUser；服务器记录保留（可直接重登），
 * 活跃用户登出时写入 reloginServerId —— gate 自动回 OnboardingLogin（携带 serverId，
 * 手测 2a「登出 → 回登录页」）；服务器记录不存在时 gate 落 OnboardingConnect。
 */
export async function logout(serverId: string, userId: string): Promise<void> {
  await deleteToken(serverId, userId);
  await deletePassword(serverId, userId);
  const state = useAccountStore.getState();
  const wasActive = state.active?.serverId === serverId && state.active?.userId === userId;
  state.actions.removeUser(serverId, userId);
  const remaining = useAccountStore
    .getState()
    .servers.find((server) => server.serverId === serverId);
  if (remaining && (wasActive || remaining.users.length === 0)) {
    // 携带该服务器上下文回登录页（gate guest 栈 initialRouteName 随 reloginServerId 走）
    state.actions.setReloginServerId(serverId);
    if (wasActive) {
      state.actions.clearActive();
    }
  }
}

/**
 * 冷启动预热活跃账号 Token 进内存（§4.10 启动时序「tokenVault 就绪」），
 * 供 getActiveAdapter 同步组装认证头；无活跃账号时为空操作。
 */
export async function warmupActiveToken(): Promise<void> {
  const state = useAccountStore.getState();
  const active = state.active;
  if (!active) {
    return;
  }
  await warmupToken(active.serverId, active.userId);
}

/**
 * 使用加密留存的账号密码自动重登（Token 失效时）：
 * 解密密码 → 登录 → 覆盖同一服务器记录的 Token/账号；成功返回 true。
 * 密码缺失、密码已在服务端修改或网络异常时返回 false，由调用方回退到登录页。
 */
export async function reloginWithStoredCredential(
  serverId: string,
  userId: string
): Promise<boolean> {
  const server = useAccountStore.getState().servers.find((item) => item.serverId === serverId);
  const user = server?.users.find((item) => item.userId === userId);
  if (server === undefined || user === undefined) {
    return false;
  }
  const password = await getPassword(serverId, userId);
  if (password === null || password === '') {
    return false;
  }
  try {
    const info: ServerInfo = {
      flavor: server.flavor,
      baseUrl: server.baseUrl,
      serverId: upstreamServerIdOf(server),
      serverName: server.serverName,
      version: server.version,
      versionTooLow: false,
    };
    const auth = await login(info, user.userName, password);
    await saveAccount(info, auth, serverId);
    return true;
  } catch {
    return false;
  }
}

// —— M6：Quick Connect 免密登录（M6 文档 §4.3.2；设计文档 §6.1 QC 行）——

/** Quick Connect 一次完整流程句柄（登录页持有；返回/关闭面板时必须 cancel） */
export interface QuickConnectFlow {
  /** 发起结果：6 位授权码 + 二维码内容 + 轮询凭据 */
  readonly session: QuickConnectSession;
  /**
   * 轮询直至授权（每 QUICK_CONNECT_POLL_INTERVAL_MS 一次，总超时 QUICK_CONNECT_TIMEOUT_MS）；
   * 授权后 loginWithQuickConnect 换 Token 并走 M1 保存链路（saveAccount），成功 resolve AuthResult。
   * 超时 reject QUICK_CONNECT_TIMEOUT、授权码失效 reject QUICK_CONNECT_EXPIRED、
   * 取消 reject QUICK_CONNECT_CANCELLED（立即，不再轮询）。
   */
  awaitAuthorization(): Promise<AuthResult>;
  /** 取消：置取消标志并立即 reject（UI 返回/关闭面板时必须调用） */
  cancel(): void;
}

/** Quick Connect 依赖注入（单测假节拍器断言轮询节奏与终止条件，M6 文档 §4.3.2） */
export interface QuickConnectDeps {
  adapter: Pick<ServerAdapter, 'isQuickConnectEnabled' | 'initiateQuickConnect' | 'pollQuickConnect' | 'loginWithQuickConnect'>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  nowFn?: () => number;
  /** 保存链路注入（缺省 saveAccount；单测断言「恰好保存一次」） */
  save?: (auth: AuthResult) => Promise<void>;
}

class QuickConnectFlowImpl implements QuickConnectFlow {
  readonly session: QuickConnectSession;

  private readonly adapter: QuickConnectDeps['adapter'];

  private readonly pollIntervalMs: number;

  private readonly timeoutMs: number;

  private readonly setTimer: (fn: () => void, ms: number) => unknown;

  private readonly clearTimer: (id: unknown) => void;

  private readonly nowFn: () => number;

  private readonly save: (auth: AuthResult) => Promise<void>;

  /** 取消标志 + 在途 promise 的 reject（cancel 立即生效，不再轮询） */
  private cancelled = false;

  private rejectPending: ((err: Error) => void) | null = null;

  constructor(session: QuickConnectSession, deps: QuickConnectDeps) {
    this.session = session;
    this.adapter = deps.adapter;
    this.pollIntervalMs = deps.pollIntervalMs ?? QUICK_CONNECT_POLL_INTERVAL_MS;
    this.timeoutMs = deps.timeoutMs ?? QUICK_CONNECT_TIMEOUT_MS;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.nowFn = deps.nowFn ?? Date.now;
    this.save = deps.save ?? saveAccountByAuth;
  }

  awaitAuthorization(): Promise<AuthResult> {
    return new Promise<AuthResult>((resolve, reject) => {
      this.rejectPending = reject;
      const start = this.nowFn();
      let timer: unknown = null;
      const stopTimer = () => {
        if (timer !== null) {
          this.clearTimer(timer);
          timer = null;
        }
      };
      const fail = (err: Error) => {
        stopTimer();
        this.rejectPending = null;
        reject(err);
      };
      const pollOnce = () => {
        // cancel 已在 rejectPending 上生效（awaitAuthorization 处于 pending），本轮仅退出
        if (this.cancelled) {
          return;
        }
        if (this.nowFn() - start >= this.timeoutMs) {
          fail(new AppError('QUICK_CONNECT_TIMEOUT'));
          return;
        }
        void (async () => {
          try {
            const state = await this.adapter.pollQuickConnect(this.session.secret);
            if (this.cancelled) {
              return;
            }
            if (state.authenticated) {
              // 授权后恰好换一次 Token（单测断言点），随即走 M1 保存链路
              const auth = await this.adapter.loginWithQuickConnect(this.session.secret);
              await (this.save ?? saveAccountByAuth)(auth);
              stopTimer();
              this.rejectPending = null;
              resolve(auth);
              return;
            }
          } catch (err) {
            if (this.cancelled) {
              return;
            }
            if (err instanceof AppError && err.code === 'QUICK_CONNECT_EXPIRED') {
              // 授权码已失效：立即终止（M6 §4.3.1 表「按超时处理」口径的立即失败路径）
              fail(err);
              return;
            }
            // 其余（网络抖动等）：吞错继续轮询，直至总超时
          }
          timer = this.setTimer(pollOnce, this.pollIntervalMs);
        })();
      };
      void pollOnce();
    });
  }

  cancel(): void {
    this.cancelled = true;
    const reject = this.rejectPending;
    this.rejectPending = null;
    if (reject !== null) {
      reject(new AppError('QUICK_CONNECT_CANCELLED'));
    }
  }
}

/** 保存链路（saveAccount 的无 ServerInfo 包装：QC 响应 ServerId 兜底探测记录） */
async function saveAccountByAuth(auth: AuthResult): Promise<void> {
  const servers = useAccountStore.getState().servers;
  // QC 上下文里服务器记录可能已存在（为已有服务器加用户）：按上游 serverId 匹配记录，
  // 追加到该记录而不是新开卡片（M6 §4.3.3）
  const known = servers.find((server) => upstreamServerIdOf(server) === auth.serverId);
  if (known === undefined) {
    // 理论不可达（登录页必有 serverInfo 上下文）；保底按最小信息登记，避免 Token 已发而账号未存
    const fallback: ServerInfo = {
      flavor: 'JELLYFIN',
      baseUrl: '',
      serverId: auth.serverId,
      serverName: auth.serverId,
      version: '',
      versionTooLow: false,
    };
    await saveAccount(fallback, auth);
    return;
  }
  const info: ServerInfo = {
    flavor: known.flavor,
    baseUrl: known.baseUrl,
    serverId: upstreamServerIdOf(known),
    serverName: known.serverName,
    version: known.version,
    versionTooLow: false,
  };
  await saveAccount(info, auth, known.serverId);
}

/**
 * 发起 Quick Connect（M6 文档 §4.3.2）：Enabled 探测（关闭/失败抛 QUICK_CONNECT_DISABLED）
 * → Initiate；返回流程句柄供登录页 QC 面板消费。
 * 「连接新服务器」「为已有服务器添加用户」两种登录上下文均可用（OnboardingLogin 是唯一登录页）。
 * recordId：已有服务器上下文传入 → 授权后追加到该记录；不传 → 按新服务器添加（同 IP 不自动合并）。
 */
export async function beginQuickConnect(
  info: ServerInfo,
  recordId?: string
): Promise<QuickConnectFlow> {
  // QC 端点免认证（无需 token）；认证头由 adapter 按既有差异实现组装
  const adapter = createAdapter({ baseUrl: info.baseUrl, flavor: info.flavor });
  try {
    const enabled = await adapter.isQuickConnectEnabled();
    if (!enabled) {
      throw new AppError('QUICK_CONNECT_DISABLED');
    }
    const session = await adapter.initiateQuickConnect();
    return createQuickConnectFlow(session, {
      adapter,
      save: async (auth) => {
        await saveAccount(info, auth, recordId);
      },
    });
  } catch (err) {
    // Initiate 的 401 已由 adapter 翻译为 QUICK_CONNECT_DISABLED；此处仅透传业务码
    throw err;
  }
}

/** 流程工厂（测试入口：注入假 adapter/假节拍器，M6 文档 §4.3.2「节拍器可注入」） */
export function createQuickConnectFlow(
  session: QuickConnectSession,
  deps: QuickConnectDeps
): QuickConnectFlow {
  return new QuickConnectFlowImpl(session, deps);
}
