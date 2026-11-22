/**
 * TV 登录态根（gate 游客侧，TV-m1 §4.1 / TV-m1-S1）：
 * TV 游客态无浏览价值，gate 直渲染本组件（不进导航栈，登录屏 BACK = 退出应用，TV 根级惯例）。
 * 入口分流：401 重登上下文（reloginServerId，expireActiveUser 写入）→ 直接落带记录的登录屏；
 * Connect 正常流程 → serverInfo 状态提升进入登录屏；历史快选 → 记录直接进登录屏。
 */
import { useEffect, useState } from 'react';

import type { ServerInfo } from '@/adapter/model';
import { useAccountStore, type ServerAccount } from '@/store/accountStore';

import { TvOnboardingConnectScreen } from '@tv/page/onboarding/TvOnboardingConnectScreen';
import { TvOnboardingLoginScreen } from '@tv/page/onboarding/TvOnboardingLoginScreen';

export function TvOnboardingRoot() {
  const reloginServerId = useAccountStore((state) => state.reloginServerId);
  const servers = useAccountStore((state) => state.servers);
  // 401 重登上下文一次性捕获：mount 时 reloginServerId 有值 → 直接落带记录的登录屏；
  // 捕获后即消费（setReloginServerId(null)），避免陈旧上下文影响后续会话
  const [reloginRecord] = useState<ServerAccount | null>(() => {
    if (reloginServerId === null) {
      return null;
    }
    return servers.find((server) => server.serverId === reloginServerId) ?? null;
  });
  useEffect(() => {
    if (reloginServerId !== null) {
      useAccountStore.getState().actions.setReloginServerId(null);
    }
  }, [reloginServerId]);

  /** Connect 正常流程 / 历史快选提升的 serverInfo（非 null 即进登录屏） */
  const [connectedInfo, setConnectedInfo] = useState<ServerInfo | null>(null);
  /** 历史快选提升的记录（Connect 页快选行） */
  const [pickedRecord, setPickedRecord] = useState<ServerAccount | null>(null);

  if (connectedInfo !== null) {
    return (
      <TvOnboardingLoginScreen
        serverInfo={connectedInfo}
        onBackToConnect={() => setConnectedInfo(null)}
      />
    );
  }
  if (pickedRecord !== null) {
    return (
      <TvOnboardingLoginScreen
        serverRecord={pickedRecord}
        onBackToConnect={() => setPickedRecord(null)}
      />
    );
  }
  if (reloginRecord !== null) {
    // 401 重登路径：不带返回（重登是唯一出路；账密/快切用户/改服务器均可兜底）
    return <TvOnboardingLoginScreen serverRecord={reloginRecord} />;
  }
  return (
    <TvOnboardingConnectScreen
      onConnected={setConnectedInfo}
      onPickRecord={setPickedRecord}
    />
  );
}
