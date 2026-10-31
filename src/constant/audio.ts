/**
 * 音频域常量（M5 文档 §4.8；设计文档 §7.5/§8.4）。
 * 禁魔法数字：universal 端点参数、循环模式、节流与宽度口径唯一出处。
 */
import type { RepeatModeEnum } from '@/adapter/model';

/** universal 端点可直连容器白名单（设计文档 §8.4 原文取值） */
export const UNIVERSAL_CONTAINER_LIST = 'opus,mp3,aac,m4a,flac,webma,ogg,wav';

/** 音频转码容器（设计文档 §8.4） */
export const AUDIO_TRANSCODING_CONTAINER = 'mp4';

/** 音频转码编码（设计文档 §8.4） */
export const AUDIO_TRANSCODING_AUDIO_CODEC = 'aac';

/**
 * 音频进度上报节流间隔（毫秒）——设计文档 §7.5（30 秒粒度）。
 * 自 M2 预留处迁移收敛至此（M5 文档 §3.2），单一事实源，constant/playback.ts 不双留。
 */
export const AUDIO_PROGRESS_REPORT_INTERVAL_MS = 30_000;

/**
 * 原生进度事件间隔（秒）＝上值派生换算（禁双处维护，改一漏一即节流失真）；
 * 熄屏/后台仍发，承担 30 秒上报的「时钟」角色（M5 文档 §4.5）。
 */
export const AUDIO_PROGRESS_UPDATE_EVENT_INTERVAL_S = AUDIO_PROGRESS_REPORT_INTERVAL_MS / 1_000;

/** 默认循环模式：列表循环（M5 文档 §4.8） */
export const DEFAULT_REPEAT_MODE: RepeatModeEnum = 'queue';

/** 上一曲按钮「回到曲头」阈值（毫秒）：位置超过该值时先 seek 回当前曲开头 */
export const PREVIOUS_RESTART_THRESHOLD_MS = 3_000;

/** 艺术家热门歌曲条数上限（服务端 Limit=PlayCount 降序） */
export const HOT_SONGS_LIMIT = 20;

/** 专辑/歌单封面与曲目封面宽（迷你条、通知栏 artwork、Now Playing 大封面共用） */
export const AUDIO_ARTWORK_MAX_WIDTH = 600;

/** 艺术家专辑网格/头像宽 */
export const ALBUM_GRID_COVER_MAX_WIDTH = 400;
