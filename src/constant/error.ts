/**
 * 错误文案 key 与可重试码常量（M1 文档 §4.3；设计文档 §6.3）。
 * 文案本体收敛在 i18n/messages（zh/en 各一份），本表只保留错误码 → MessageKey 映射；
 * 页面禁止另行定义错误文案，统一经 errorMessageOf（非组件）或 useT + errorMessageKeyOf（组件）。
 */
import type { MessageKey } from '@/i18n/messages/zh';
import type { AppErrorCode } from '@/infra/error';

/** 错误码 → 文案 key（error.* 命名空间与错误码同名，便于检索） */
export const ERROR_MESSAGE_KEYS: Record<AppErrorCode, MessageKey> = {
  INVALID_ADDRESS: 'error.INVALID_ADDRESS',
  NETWORK_UNREACHABLE: 'error.NETWORK_UNREACHABLE',
  TLS_ERROR: 'error.TLS_ERROR',
  NOT_MEDIA_SERVER: 'error.NOT_MEDIA_SERVER',
  LOGIN_FAILED: 'error.LOGIN_FAILED',
  UNAUTHORIZED: 'error.UNAUTHORIZED',
  NOT_FOUND: 'error.NOT_FOUND',
  RATE_LIMITED: 'error.RATE_LIMITED',
  SERVER_ERROR: 'error.SERVER_ERROR',
  PLAYBACK_UNSUPPORTED: 'error.PLAYBACK_UNSUPPORTED',
  AUDIO_ENGINE_INIT_FAILED: 'error.AUDIO_ENGINE_INIT_FAILED',
  PHOTO_SAVE_FAILED: 'error.PHOTO_SAVE_FAILED',
  PHOTO_SAVE_PERMISSION_DENIED: 'error.PHOTO_SAVE_PERMISSION_DENIED',
  QUICK_CONNECT_DISABLED: 'error.QUICK_CONNECT_DISABLED',
  QUICK_CONNECT_TIMEOUT: 'error.QUICK_CONNECT_TIMEOUT',
  QUICK_CONNECT_CANCELLED: 'error.QUICK_CONNECT_CANCELLED',
  QUICK_CONNECT_EXPIRED: 'error.QUICK_CONNECT_EXPIRED',
  DOWNLOAD_UNAVAILABLE: 'error.DOWNLOAD_UNAVAILABLE',
  DOWNLOAD_NO_SPACE: 'error.DOWNLOAD_NO_SPACE',
  DOWNLOAD_DUPLICATE: 'error.DOWNLOAD_DUPLICATE',
  DOWNLOAD_CREDENTIAL_MISSING: 'error.DOWNLOAD_CREDENTIAL_MISSING',
  NOT_IMPLEMENTED: 'error.NOT_IMPLEMENTED',
  UNKNOWN: 'error.UNKNOWN',
};

/** 可自动重试的错误码集合（M4 §4.2 定稿：网络类 5 码可重试，其余不可） */
export const RETRYABLE_ERROR_CODES: ReadonlySet<AppErrorCode> = new Set([
  'NETWORK_UNREACHABLE',
  'TLS_ERROR',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'UNKNOWN',
]);

/**
 * TLS 错误 message 关键词启发式（M4 §4.2 收口补全；小写匹配）。
 * Android RN 的 XHR 网络错误不透传结构化错误码，JS 层只能靠 message 关键词
 * 识别证书错误（启发式可能漏判）——本表为运行期请求的主判，
 * 与 connect 链路原生 probe 精确细分两层并存、产出同一码 TLS_ERROR（M4 §4.2 唯一规范）。
 */
export const TLS_ERROR_PATTERNS: ReadonlySet<string> = new Set([
  'certificate',
  'ssl',
  'tls',
  'handshake',
  'trust anchor',
  'pkix',
]);
