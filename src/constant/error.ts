/**
 * 错误文案与可重试码常量（M1 文档 §4.3；设计文档 §6.3）。
 * 本表为全部错误文案的唯一定义处（04 收口逐字沿用本表并收编三增补码）。
 */
import type { AppErrorCode } from '@/infra/error';

/** 错误码 → 中文文案（验收标准 3 与手测逐字引用此处，禁止页面另行定义） */
export const ERROR_MESSAGE_MAP: Record<AppErrorCode, string> = {
  INVALID_ADDRESS: '地址格式无效，请输入如 http://192.168.1.5:8096',
  NETWORK_UNREACHABLE: '无法连接服务器，请检查地址与网络后重试',
  TLS_ERROR: '服务器证书校验失败。若为自签名证书，可在设置中开启「忽略证书校验」后重试',
  NOT_MEDIA_SERVER: '该地址不是 Emby/Jellyfin 服务器',
  LOGIN_FAILED: '用户名或密码错误',
  UNAUTHORIZED: '登录已失效，请重新输入密码',
  NOT_FOUND: '内容不存在或已被移除',
  RATE_LIMITED: '服务器繁忙，请稍后重试',
  SERVER_ERROR: '服务器内部错误，请稍后重试',
  // M2 增量码；文案 M3 起更新（03 §4.2：直连/转码皆否仅剩服务器无转码器等罕见场景）；M4 收口时随映射表迁移
  PLAYBACK_UNSUPPORTED: '无法播放：服务器无法直连或转码该文件',
  // M5 增量码（05 文档 §4.8/§4.17，中文文案沿用 M1/M4 归一化口径）
  AUDIO_ENGINE_INIT_FAILED: '音频引擎初始化失败，请重启应用',
  PHOTO_SAVE_FAILED: '保存到本地相册失败，请重试',
  PHOTO_SAVE_PERMISSION_DENIED: '未授予相册写入权限，无法保存',
  // M6 增量码（06 文档 §4.8，中文文案按验收项 A2/A7 手测口径）
  QUICK_CONNECT_DISABLED: '该服务器未启用 Quick Connect，请使用密码登录',
  QUICK_CONNECT_TIMEOUT: '授权超时，请重试',
  QUICK_CONNECT_CANCELLED: '已取消 Quick Connect 登录',
  QUICK_CONNECT_EXPIRED: '授权码已失效，请重新发起',
  DOWNLOAD_UNAVAILABLE: '该条目需服务器转码，暂不支持下载',
  DOWNLOAD_NO_SPACE: '剩余空间不足',
  DOWNLOAD_DUPLICATE: '该条目已在下载列表',
  NOT_IMPLEMENTED: '功能开发中',
  UNKNOWN: '出错了，请稍后重试',
};

/** 可自动重试的错误码集合（04 §4.2 定稿：网络类 5 码可重试，其余不可） */
export const RETRYABLE_ERROR_CODES: ReadonlySet<AppErrorCode> = new Set([
  'NETWORK_UNREACHABLE',
  'TLS_ERROR',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'UNKNOWN',
]);

/**
 * TLS 错误 message 关键词启发式（04 §4.2 收口补全；小写匹配）。
 * Android RN 的 XHR 网络错误不透传结构化错误码，JS 层只能靠 message 关键词
 * 识别证书错误（启发式可能漏判）——本表为运行期请求的主判，
 * 与 connect 链路原生 probe 精确细分两层并存、产出同一码 TLS_ERROR（04 §4.2 唯一规范）。
 */
export const TLS_ERROR_PATTERNS: ReadonlySet<string> = new Set([
  'certificate',
  'ssl',
  'tls',
  'handshake',
  'trust anchor',
  'pkix',
]);
