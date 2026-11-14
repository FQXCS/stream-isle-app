/**
 * 蜂窝自动降分辨率判定（原码率降档语义替换）：纯函数，单测真值表。
 * 接线在 PlayerScreen 的 netinfo 订阅（仅 connectionType 变化时执行）。
 */
import type { ResolutionTier, ResolutionTierKey } from '@/constant/resolution';
import {
  CELLULAR_RESOLUTION_TIER,
  RESOLUTION_TIER_LIST,
  RESOLUTION_TIER_MAP,
} from '@/constant/resolution';

/** 档位严格程度：列表越靠后上限越低 */
function rankOf(tier: ResolutionTierKey): number {
  return RESOLUTION_TIER_LIST.findIndex((item) => item.key === tier);
}

/**
 * 网络类型 → 应生效档位：
 * - 'none'（断网）→ null：不动作（断网过渡态不触发任何会话动作，网络错误交由播放器
 *   onError 兜底——WiFi→蜂窝若经飞行模式，type 序列为 wifi→none→cellular，none 必须排除，
 *   否则断网中 resolve 必败并按 M3 §4.11 退出播放，降档永不达成）；
 * - 'cellular' 且开关开 → 用户档与 480p 取更严格者（蜂窝默认值；调用方在用户手动选择后
 *   不再调用本判定，手动选择优先）；
 * - 其余（wifi/未知类型/开关关）→ userTier（含恢复方向：蜂窝回 WiFi 自动回用户档位）。
 */
export function resolveResolutionTierForNetwork(
  userTier: ResolutionTierKey,
  connectionType: string,
  autoDowngradeOnCellular: boolean
): ResolutionTierKey | null {
  if (connectionType === 'none') {
    return null;
  }
  if (connectionType === 'cellular' && autoDowngradeOnCellular) {
    return rankOf(userTier) > rankOf(CELLULAR_RESOLUTION_TIER) ? userTier : CELLULAR_RESOLUTION_TIER;
  }
  return userTier;
}

/**
 * 菜单可选档位：隐藏高于源分辨率的档（转码只降不升）；原画恒显示。
 * 源尺寸未知（本地会话/服务器未给 MediaStreams）时展示全部档位。
 */
export function availableResolutionTiers(sourceHeight?: number): readonly ResolutionTier[] {
  if (sourceHeight === undefined || sourceHeight <= 0) {
    return RESOLUTION_TIER_LIST;
  }
  return RESOLUTION_TIER_LIST.filter(
    (tier) => tier.maxHeight === 0 || tier.maxHeight <= sourceHeight
  );
}

/** 菜单当前项归一：高于源的档不会放大，效果等价原画，展示为原画 */
export function normalizeResolutionTierForSource(
  tier: ResolutionTierKey,
  sourceHeight?: number
): ResolutionTierKey {
  if (sourceHeight === undefined || sourceHeight <= 0) {
    return tier;
  }
  return RESOLUTION_TIER_MAP[tier].maxHeight > sourceHeight ? 'UNLIMITED' : tier;
}
