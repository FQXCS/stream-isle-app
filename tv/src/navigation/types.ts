/**
 * TV 导航参数类型（TV-m1 §4.1，TV-m1-S2）：TV 精简副本。
 * mobile 的 types.ts 住在 @/page/navigation/（TV 禁入），移动它破坏手机零改动；
 * 副本只声明 TV 路由子集，参数形状对齐 mobile，模型类型一律 @/adapter/model 共享。
 * m2/m3 追加：Item {itemId} / Library {library: MediaLibrary} / Search undefined / Player {...} / Person {personId}
 */
import type { ServerInfo } from '@/adapter/model';
import { ROUTES } from '@/constant/navigation';

import { TV_ROUTES } from '@tv/constant/navigation';

export type TvStackParamList = {
  [TV_ROUTES.SHELL]: undefined;
  /** Connect 正常流程带 serverInfo；401 重登路径带 serverId（形状与手机对齐） */
  [ROUTES.ONBOARDING_CONNECT]: undefined;
  [ROUTES.ONBOARDING_LOGIN]: { serverInfo?: ServerInfo; serverId?: string } | undefined;
};
