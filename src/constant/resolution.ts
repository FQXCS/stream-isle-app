/**
 * 转码分辨率档位（替代原码率档位）：Emby 通过 DeviceProfile.TranscodingProfiles[].MaxWidth/
 * MaxHeight 限制转码输出分辨率（直连不受影响，本机 Emby 4.10.2 实测）。
 * 档位同时内置码率上限（MaxStreamingBitrate）：Emby 按该值决定转码码率，仅给分辨率会导致
 * 高码率转码输出；音频无分辨率维度，走 constant/bitrate.ts 的固定值。
 */

/** 分辨率档位键（settingsStore.maxResolutionTier 持久化值） */
export type ResolutionTierKey = 'UNLIMITED' | 'UHD' | 'FHD' | 'HD' | 'SD';

export interface ResolutionTier {
  key: ResolutionTierKey;
  label: string;
  /** 0 = 不限制（不写 MaxWidth/MaxHeight） */
  maxWidth: number;
  maxHeight: number;
  /** 随档位内置的转码码率上限（MaxStreamingBitrate） */
  bitrateBps: number;
}

export const RESOLUTION_TIER_MAP: Record<ResolutionTierKey, ResolutionTier> = {
  UNLIMITED: { key: 'UNLIMITED', label: '原画', maxWidth: 0, maxHeight: 0, bitrateBps: 60_000_000 },
  UHD: { key: 'UHD', label: '4K', maxWidth: 3840, maxHeight: 2160, bitrateBps: 40_000_000 },
  FHD: { key: 'FHD', label: '1080p', maxWidth: 1920, maxHeight: 1080, bitrateBps: 20_000_000 },
  HD: { key: 'HD', label: '720p', maxWidth: 1280, maxHeight: 720, bitrateBps: 10_000_000 },
  SD: { key: 'SD', label: '480p', maxWidth: 854, maxHeight: 480, bitrateBps: 4_000_000 },
};

/** 菜单顺序即定义顺序（ResolutionMenu 与设置页共用；越靠后越严格） */
export const RESOLUTION_TIER_LIST = (Object.keys(RESOLUTION_TIER_MAP) as ResolutionTierKey[]).map(
  (key) => RESOLUTION_TIER_MAP[key]
);

/** 默认档位：原画（不限制转码输出分辨率） */
export const DEFAULT_RESOLUTION_TIER: ResolutionTierKey = 'UNLIMITED';

/** 蜂窝自动降档目标：480p（仅作默认；用户手动选择后以手动档位为准） */
export const CELLULAR_RESOLUTION_TIER: ResolutionTierKey = 'SD';
