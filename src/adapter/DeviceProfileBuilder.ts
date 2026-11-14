/**
 * DeviceProfile 完整版（M3 文档 §4.4；设计文档 §8.2）。
 * 按解码能力探测（DecoderCapabilities）× 转码分辨率档位 × 字幕策略矩阵动态构建
 * PlaybackInfo 的 DeviceProfile，取代 M2 最小静态版 buildDirectPlayProfile。
 *
 * 关键决策（M3 §4.4.2）：DirectPlayProfile 声明 hevc 的条件是「探测到 HEVC Main10」而非
 * 「有 HEVC 解码器」——仅 8bit 硬解的机型直连 10bit 片会花屏，Main10 才允许声明，
 * 8bit-only 机型让 10bit 片自动转码（h264 输出），即验收 T1 的机制。
 */
import type { ResolutionTierKey } from '@/constant/resolution';
import { RESOLUTION_TIER_MAP } from '@/constant/resolution';

/** 直连能力声明条目（服务器 DirectPlayProfiles 词表形态） */
export interface DirectPlayProfile {
  Container: string;
  Type: 'Video';
  VideoCodec: string;
  AudioCodec: string;
}

/** 转码能力声明条目（HLS，服务器 TranscodingProfiles 词表形态） */
export interface TranscodingProfile {
  Container: string;
  Type: 'Video';
  VideoCodec: string;
  AudioCodec: string;
  Protocol: 'hls';
  /** 转码输出分辨率上限（Emby 词表；无限制档不输出） */
  MaxWidth?: number;
  MaxHeight?: number;
}

/** 字幕策略条目（External=外挂 vtt 喂播放器；Encode=服务器烧入画面） */
export interface SubtitleProfile {
  Format: string;
  Method: 'External' | 'Encode';
}

/** 客户端上报的设备能力（PlaybackInfo body 的 DeviceProfile） */
export interface DeviceProfile {
  MaxStreamingBitrate: number;
  DirectPlayProfiles: DirectPlayProfile[];
  TranscodingProfiles: TranscodingProfile[];
  SubtitleProfiles: SubtitleProfile[];
}

/** Android 解码能力探测结果（原生模块产出，infra/mediaCaps 缓存） */
export interface DecoderCapabilities {
  /** HEVC Main10（10bit）硬解 */
  supportsHevcMain10: boolean;
  supportsVp9: boolean;
  /** 仅硬解才为 true（AV1 软解性能不可接受；API < 29 的设备一律 false） */
  supportsAv1: boolean;
}

/** buildDeviceProfile 入参（服务层组装：settingsStore + mediaCaps） */
export interface DeviceProfileOptions {
  maxResolutionTier: ResolutionTierKey;
  allowHevcDirectPlay: boolean;
  decoderCaps: DecoderCapabilities;
}

/** 转码能力声明恒定值（M3 §4.4.2：ts 容器 h264+aac HLS） */
const TRANSCODING_PROFILE_BASE: TranscodingProfile = {
  Container: 'ts',
  Type: 'Video',
  VideoCodec: 'h264',
  AudioCodec: 'aac',
  Protocol: 'hls',
};

/** 字幕策略矩阵恒定值（M3 §4.4.2，与设计文档 §8.2 JSON 逐字一致） */
const SUBTITLE_PROFILES: SubtitleProfile[] = [
  { Format: 'vtt', Method: 'External' },
  { Format: 'srt', Method: 'External' },
  { Format: 'ass', Method: 'Encode' },
  { Format: 'pgs', Method: 'Encode' },
  { Format: 'sub', Method: 'Encode' },
];

/**
 * 完整版构建：按解码能力 × 转码分辨率档位 × 字幕策略矩阵产出 DeviceProfile。
 * DirectPlayProfiles 恒为一条，VideoCodec 动态拼接：
 * h264 恒在；hevc 仅 Main10 探测为真且「允许 HEVC 直连」开关开启；vp9/av1 按探测结果。
 * 转码档按档位输出 MaxWidth/MaxHeight（无限制档不输出），MaxStreamingBitrate 取档位内置上限。
 */
export function buildDeviceProfile(opts: DeviceProfileOptions): DeviceProfile {
  const codecs = ['h264'];
  if (opts.decoderCaps.supportsHevcMain10 && opts.allowHevcDirectPlay) {
    codecs.push('hevc');
  }
  if (opts.decoderCaps.supportsVp9) {
    codecs.push('vp9');
  }
  if (opts.decoderCaps.supportsAv1) {
    codecs.push('av1');
  }
  const tier = RESOLUTION_TIER_MAP[opts.maxResolutionTier];
  const transcodingProfile: TranscodingProfile =
    tier.maxHeight > 0
      ? { ...TRANSCODING_PROFILE_BASE, MaxWidth: tier.maxWidth, MaxHeight: tier.maxHeight }
      : TRANSCODING_PROFILE_BASE;
  return {
    MaxStreamingBitrate: tier.bitrateBps,
    DirectPlayProfiles: [
      {
        Container: 'mp4,mkv,mov,m4v',
        Type: 'Video',
        VideoCodec: codecs.join(','),
        AudioCodec: 'aac,mp3,ac3,eac3,flac,opus',
      },
    ],
    TranscodingProfiles: [transcodingProfile],
    SubtitleProfiles: SUBTITLE_PROFILES,
  };
}
