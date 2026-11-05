/**
 * 播放域常量（M1 文档 §4.2 + M2 文档 §4.7；设计文档 §7.2/§7.3/§7.5）。
 * M2 落直连播放：进度上报、续播、兜底已看、播放器交互间隔均收敛于此。
 */

/** 视频进度上报节流间隔（毫秒），见设计文档 §7.3 */
export const PROGRESS_REPORT_INTERVAL_MS = 10000;

/** 续播弹窗最小起始位置（毫秒）：断点 ≤ 10 秒视为未开始，直接从头播，见设计文档 §7.3 */
export const RESUME_MIN_POSITION_MS = 10000;

/** 已看完成阈值：播放位置/时长 ≥ 0.95 视为完成（续播不再弹窗 + Stopped 兜底标记），见设计文档 §7.3 */
export const WATCHED_COMPLETION_RATIO = 0.95;

/** 控制层无操作自动隐藏间隔（毫秒） */
export const CONTROLS_AUTO_HIDE_MS = 5000;

/** 水平 seek 灵敏度：全屏宽拖动对应的最大秒数 */
export const SEEK_FULL_WIDTH_SECONDS = 90;

/** Stopped 上报失败重试延迟（毫秒） */
export const STOPPED_RETRY_DELAY_MS = 2000;

/** 相似推荐条数上限 */
export const SIMILAR_LIMIT = 12;

/** 演员横滑行人数上限 */
export const CAST_ROW_LIMIT = 20;

/** 烧录字幕重启提示文案（SessionRestartOverlay），见设计文档 §8.2 */
export const BURN_IN_RESTART_NOTICE = '该字幕需服务器转码渲染，正在切换…';

/** 分辨率切换重启提示文案 */
export const RESOLUTION_RESTART_NOTICE = '正在切换分辨率…';

/** 音轨切换（转码重启路径）提示文案（03 §4.6.2 switchAudioTrack 走重启增强） */
export const AUDIO_TRACK_RESTART_NOTICE = '正在切换音轨…';

/** 自动连播下一集浮层提示文案（04 §4.4：natural_end 的 EPISODE 分支换源续播） */
export const AUTO_NEXT_RESTART_NOTICE = '正在播放下一集…';

/** 重启会话 resolve 失败自动重试前等待（毫秒），见 03 §4.11 */
export const RESTART_RESOLVE_RETRY_DELAY_MS = 500;

/**
 * 默认字幕语言偏好（服务器 MediaStream.Language 为 ISO 639-2 三字码）；
 * settingsStore.preferredSubtitleLang 默认 null 时取本值，见设计文档 §11「文本轨优先策略」。
 */
export const DEFAULT_SUBTITLE_LANGUAGE = 'chi';
