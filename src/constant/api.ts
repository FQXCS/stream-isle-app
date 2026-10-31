/**
 * HTTP 请求常量（M1 文档 §4.2 / §4.5.1）。
 */

/** 普通请求超时（毫秒） */
export const REQUEST_TIMEOUT_MS = 20000;

/** 探测请求超时（毫秒，GET /System/Info/Public） */
export const PROBE_TIMEOUT_MS = 10000;

/** 登录端点后缀：错误归一化 401 分流（LOGIN_FAILED/UNAUTHORIZED）与 adapter 登录端点共用同一常量（§4.5.2） */
export const LOGIN_PATH_SUFFIX = '/Users/AuthenticateByName';

/** 最大重定向次数（axios 默认 5，显式收敛常量禁魔法数字） */
export const MAX_REDIRECTS = 5;
