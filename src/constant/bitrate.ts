/**
 * 码率档位常量（M3 文档 §4.2；设计文档 §8.2/§11）。
 * 档位持久化于 settingsStore.maxBitrateMode；蜂窝降档目标档与恢复语义见 util/bitrate.ts。
 */

/** 码率档位键（settingsStore.maxBitrateMode 持久化值） */
export type BitrateTierKey = 'AUTO' | 'HIGH' | 'MEDIUM' | 'LOW';

/** 档位定义：label 为菜单展示文案，bitrateBps 写 DeviceProfile.MaxStreamingBitrate */
export const BITRATE_TIER_MAP: Record<BitrateTierKey, { label: string; bitrateBps: number }> = {
  AUTO: { label: '自动', bitrateBps: 20_000_000 },
  HIGH: { label: '高清 10Mbps', bitrateBps: 10_000_000 },
  MEDIUM: { label: '标清 4Mbps', bitrateBps: 4_000_000 },
  LOW: { label: '省流 2Mbps', bitrateBps: 2_000_000 },
};

/** 菜单顺序即定义顺序（BitrateMenu 与设置页共用） */
export const BITRATE_TIER_LIST = (Object.keys(BITRATE_TIER_MAP) as BitrateTierKey[]).map((key) => ({
  key,
  ...BITRATE_TIER_MAP[key],
}));

/** 默认档位：自动（20Mbps），见设计文档 §8.2 */
export const DEFAULT_BITRATE_TIER: BitrateTierKey = 'AUTO';

/** 蜂窝强制档位 = 4Mbps（自动降档目标），见设计文档 §11 */
export const CELLULAR_BITRATE_TIER: BitrateTierKey = 'MEDIUM';
