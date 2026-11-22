/**
 * 错误归一化（M1 文档 §4.5.2，对齐设计文档 §6.3；M4 收口版终态命名）。
 * 以 M4 收口版为唯一终态：AppErrorCode 12 码全集 / AppError / normalizeHttpError。
 */
import { LOGIN_PATH_SUFFIX } from '@/constant/api';
import {
  ERROR_MESSAGE_KEYS,
  RETRYABLE_ERROR_CODES,
  TLS_ERROR_PATTERNS,
} from '@/constant/error';
import type { MessageKey } from '@/i18n/messages/zh';
import { t } from '@/i18n';
import { apiEvents } from '@/infra/api/apiEvents';

/** 业务错误码全集（12 码 + M6 增量 7 码） */
export type AppErrorCode =
  | 'INVALID_ADDRESS' // 【M1 增补】地址格式非法（AuthService.connect 对 normalizeAddress 的 null 结果转换）
  | 'NETWORK_UNREACHABLE' // 无响应：超时/DNS 失败/断网/错误地址
  | 'TLS_ERROR' // 证书校验失败（自签名）；唯一生产者 = AuthService.connect 经原生 probe 细分
  | 'NOT_MEDIA_SERVER' // 探测 200 但非 Jellyfin/Emby（不经 axios 产生，探测流程抛出）
  | 'UNAUTHORIZED' // 401 且非登录接口：Token 失效 → 触发全局登出
  | 'LOGIN_FAILED' // 401 且为登录接口：用户名或密码错误
  | 'NOT_FOUND' // 404
  | 'RATE_LIMITED' // 429 / 503
  | 'SERVER_ERROR' // 其余 5xx
  | 'PLAYBACK_UNSUPPORTED' // 【M2/M3 增补】无直连且无转码能力（M1 预留码位）
  | 'AUDIO_ENGINE_INIT_FAILED' // 【M5 增补】音频引擎初始化失败（厂商 ROM 服务异常等）
  | 'PHOTO_SAVE_FAILED' // 【M5 增补】保存到本地相册失败
  | 'PHOTO_SAVE_PERMISSION_DENIED' // 【M5 增补】未授予相册写入权限
  | 'QUICK_CONNECT_DISABLED' // 【M6 增补】服务器未启用 Quick Connect（M6 文档 §4.8）
  | 'QUICK_CONNECT_TIMEOUT' // 【M6 增补】Quick Connect 授权超时（M6 文档 §4.8）
  | 'QUICK_CONNECT_CANCELLED' // 【M6 增补】Quick Connect 用户取消（M6 文档 §4.8）
  | 'QUICK_CONNECT_EXPIRED' // 【M6 增补】Quick Connect 授权码已失效（M6 文档 §4.8）
  | 'DOWNLOAD_UNAVAILABLE' // 【M6 增补】条目需服务器转码，暂不支持下载（M6 文档 §4.8）
  | 'DOWNLOAD_NO_SPACE' // 【M6 增补】剩余空间不足（M6 文档 §4.8）
  | 'DOWNLOAD_DUPLICATE' // 【M6 增补】该条目已在下载列表（M6 文档 §4.8）
  | 'DOWNLOAD_CREDENTIAL_MISSING' // 下载凭据缺失（账号/Token 被清理，需重新登录）
  | 'FORBIDDEN' // 【音乐个人歌单增量】403：账号无该操作权限（歌单写入/条目删除等）
  | 'PLAYLIST_DUPLICATE' // 【音乐个人歌单四改】加入歌单查重全部命中：所选歌曲均已在目标歌单中
  | 'NOT_IMPLEMENTED' // 【M1 增补】adapter 未实现的接口方法（M1 占位保护）
  | 'UNKNOWN'; // 其余（含 400 等未列举状态码，httpStatus 留痕）

/** 归一化业务错误：页面只消费 code，文案经 errorMessageOf 查询 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  /** 原始 HTTP 状态码（日志用） */
  readonly httpStatus?: number;

  /** 服务器原始错误文本（仅日志，禁止直接展示） */
  readonly serverMessage?: string;

  constructor(
    code: AppErrorCode,
    opts?: { httpStatus?: number; serverMessage?: string; cause?: unknown }
  ) {
    // message 固定为错误码（仅日志/调试；UI 展示统一经 errorMessageOf / errorMessageKeyOf）
    super(code, { cause: opts?.cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = opts?.httpStatus;
    this.serverMessage = opts?.serverMessage;
  }
}

/**
 * axios 错误 → AppError 归一化（纯函数；ApiClient 错误拦截器核心）。
 *
 * 规则（M4 §4.2 判定表）：err.response 存在 → 按 status 映射；401 按请求 path 是否含
 * 登录端点常量区分 LOGIN_FAILED / UNAUTHORIZED（后者同时 emit("UNAUTHORIZED") 触发全局登出）；
 * 404→NOT_FOUND、429/503→RATE_LIMITED、其余 5xx→SERVER_ERROR、其余带响应状态（400/403 等）→UNKNOWN；
 * err.response 不存在（网络层失败）→ message 小写命中 TLS_ERROR_PATTERNS → TLS_ERROR（M4 收口补全），
 * 其余 → NETWORK_UNREACHABLE。
 *
 * TLS 两层机制（M4 §4.2 唯一规范）：本函数的 message 启发式为运行期请求主判（纯函数、
 * 不触碰原生模块）；connect 探测链路的原生 probe 精确细分（M1 既有）为 Onboarding 链路
 * 的第二层——两路径产出同一码 TLS_ERROR，页面只消费错误码。
 *
 * @param err 捕获的未知错误（axios 错误或任意异常）
 * @param requestPath 请求 URL（用于 401 登录端点分流）
 * @param opts.emitUnauthorized 401 时是否 emit 全局登出事件（默认 true；Quick Connect 免认证端点
 *   以 401 表达「服务器未启用 QC」（M6 文档 §4.3.1），语义不是 Token 失效，调用方传 false 抑制，
 *   避免「为已有服务器添加用户」上下文被误登出）
 */
export function normalizeHttpError(
  err: unknown,
  requestPath: string,
  opts?: { emitUnauthorized?: boolean }
): AppError {
  const axiosLike = err as {
    response?: { status?: number; data?: unknown } | null;
    message?: string;
  } | null;
  const response = axiosLike?.response;
  if (response && typeof response.status === 'number') {
    const status = response.status;
    if (status === 401) {
      const isLoginRequest = requestPath.includes(LOGIN_PATH_SUFFIX);
      if (isLoginRequest) {
        return new AppError('LOGIN_FAILED', { httpStatus: status, cause: err });
      }
      // Token 失效：触发全局登出事件（根组件订阅后 expireActiveUser 幂等登出，M4 §4.2）
      if (opts?.emitUnauthorized !== false) {
        apiEvents.emit('UNAUTHORIZED');
      }
      return new AppError('UNAUTHORIZED', { httpStatus: status, cause: err });
    }
    if (status === 404) {
      return new AppError('NOT_FOUND', { httpStatus: status, cause: err });
    }
    if (status === 403) {
      // 403：账号无权限（原归 UNKNOWN 文案含糊；歌单写入/删除等场景需明确「无权限」提示）
      return new AppError('FORBIDDEN', { httpStatus: status, cause: err });
    }
    if (status === 429 || status === 503) {
      return new AppError('RATE_LIMITED', { httpStatus: status, cause: err });
    }
    if (status >= 500) {
      return new AppError('SERVER_ERROR', { httpStatus: status, cause: err });
    }
    return new AppError('UNKNOWN', {
      httpStatus: status,
      serverMessage: extractServerMessage(response.data),
      cause: err,
    });
  }
  // 无 response：网络层失败（超时/DNS/断网/错误地址/证书错误）
  // 先按 message 关键词启发式识别证书错误（M4 §4.2 收口补全；启发式可能漏判，
  // 漏判落 NETWORK_UNREACHABLE 由 connect 链路原生 probe 兜底细分）
  const message = typeof axiosLike?.message === 'string' ? axiosLike.message.toLowerCase() : '';
  for (const pattern of TLS_ERROR_PATTERNS) {
    if (message.includes(pattern)) {
      return new AppError('TLS_ERROR', { cause: err });
    }
  }
  return new AppError('NETWORK_UNREACHABLE', { cause: err });
}

/** 从服务器错误响应体提取可留痕文本（仅日志用） */
function extractServerMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return undefined;
}

/** 错误码 → 文案 key（组件内需配合 useT 使用，保证语言切换实时刷新） */
export function errorMessageKeyOf(code: AppErrorCode): MessageKey {
  return ERROR_MESSAGE_KEYS[code];
}

/** 查错误文案（非组件场景：Toast/事件回调；组件内请用 useT + errorMessageKeyOf） */
export function errorMessageOf(code: AppErrorCode): string {
  return t(ERROR_MESSAGE_KEYS[code]);
}

/** 判断字符串是否为合法错误码（下载失败原因等持久化文本展示时用） */
export function isAppErrorCode(value: string): value is AppErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGE_KEYS, value);
}

/** 是否可自动重试 */
export function isRetryable(code: AppErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}
