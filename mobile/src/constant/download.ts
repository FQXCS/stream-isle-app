/**
 * 下载域常量（M6 文档 §4.8）：下载并发、磁盘余量、UI 节流、目录名与文件名。
 * 禁魔法数字：DownloadService / db / 下载页唯一出处。
 */

/** 下载并发数（单飞，避免挤占带宽与服务器转码资源，M6 文档 §4.4.2） */
export const MAX_CONCURRENT_DOWNLOADS = 1;

/** 下载后最少保留剩余空间（512MB，M6 文档 §4.8） */
export const MIN_FREE_DISK_MARGIN_BYTES = 512 * 1024 * 1024;

/** 下载进度 UI 刷新节流（毫秒；进度仅写内存 store，状态迁移才落 SQLite，M6 文档 §4.4.2） */
export const DOWNLOAD_PROGRESS_UI_THROTTLE_MS = 500;

/** documentDirectory 下的下载根目录名（M6 文档 §4.8） */
export const DOWNLOAD_DIR_NAME = 'downloads';

/** 本地媒体文件名前缀（落盘为 media.{container}，M6 文档 §4.4.1 目录布局） */
export const DOWNLOAD_MEDIA_FILE_BASE_NAME = 'media';

/** 本地海报文件名（海报本地化，M6 文档 §4.4.1） */
export const DOWNLOAD_POSTER_FILE_NAME = 'poster.jpg';

/** 离线补报定时兜底间隔（毫秒；仅进程内存活有效，M6 文档 §4.5） */
export const OFFLINE_FLUSH_RETRY_INTERVAL_MS = 60_000;
