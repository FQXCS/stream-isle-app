/**
 * 音频码率常量：音频无分辨率维度，universal 端点固定上报 20Mbps 上限（05 文档 §4.4）。
 * 视频转码分辨率档位见 constant/resolution.ts。
 */

/** 音频 universal 端点 MaxStreamingBitrate */
export const AUDIO_MAX_STREAMING_BITRATE_BPS = 20_000_000;
