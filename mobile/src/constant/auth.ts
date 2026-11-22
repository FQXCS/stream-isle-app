/**
 * 认证域常量（M1 文档 §4.2 域划分；M6 增量 Quick Connect 轮询节奏，M6 文档 §4.8）。
 */

/** Quick Connect 轮询间隔（毫秒；Jellyfin 官方 SDK 建议值，M6 文档 §4.8） */
export const QUICK_CONNECT_POLL_INTERVAL_MS = 5_000;

/** Quick Connect 授权总超时（毫秒；2 分钟，可取消，M6 文档 §4.8） */
export const QUICK_CONNECT_TIMEOUT_MS = 120_000;
