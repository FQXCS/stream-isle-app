/**
 * 蜂窝自动降档判定（M3 文档 §4.9；设计文档 §11）：纯函数，单测真值表。
 * 接线在 PlayerPage 的 netinfo 订阅（仅 connectionType 变化时执行）。
 */
import type { BitrateTierKey } from '@/constant/bitrate';
import { CELLULAR_BITRATE_TIER } from '@/constant/bitrate';

/**
 * 网络类型 → 应生效档位：
 * - 'none'（断网）→ null：不动作（断网过渡态不触发任何会话动作，网络错误交由播放器
 *   onError 兜底——WiFi→蜂窝若经飞行模式，type 序列为 wifi→none→cellular，none 必须排除，
 *   否则断网中 resolve 必败并按 03 §4.11 退出播放，降档永不达成）；
 * - 'cellular' 且开关开 → CELLULAR_BITRATE_TIER（4Mbps）；
 * - 其余（wifi/未知类型/开关关）→ userTier（含恢复方向：蜂窝回 WiFi 自动回用户档位）。
 */
export function resolveBitrateTierForNetwork(
  userTier: BitrateTierKey,
  connectionType: string,
  autoDowngradeOnCellular: boolean
): BitrateTierKey | null {
  if (connectionType === 'none') {
    return null;
  }
  if (connectionType === 'cellular' && autoDowngradeOnCellular) {
    return CELLULAR_BITRATE_TIER;
  }
  return userTier;
}
