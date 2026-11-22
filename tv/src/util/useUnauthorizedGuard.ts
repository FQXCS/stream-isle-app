/**
 * TV 401 全局守卫（TV-m1 §4.7）：与手机 RootNavigator 同链路、TV 自持订阅。
 * 订阅点在 App 根（常驻）而非 Shell——gate 切换会卸载 Shell，订阅不能随之消失：
 * expireActiveUser → active=null → gate 切登录屏（reloginServerId 已写入，带 serverId 落屏）；
 * reloginWithStoredCredential 成功 → switchActiveUser 复位失效标志，gate 自动回壳（验收 #11）。
 */
import { useEffect, useRef } from 'react';

import { errorMessageOf } from '@/infra/error';
import { apiEvents } from '@/infra/api/apiEvents';
import { showToast } from '@/component/Toast';
import { reloginWithStoredCredential } from '@/service/AuthService';
import { useAccountStore } from '@/store/accountStore';

export function useUnauthorizedGuard(): void {
  const reloginRef = useRef(false);
  useEffect(() => {
    const unsubscribe = apiEvents.on('UNAUTHORIZED', () => {
      const state = useAccountStore.getState();
      const serverId = state.active?.serverId ?? null;
      const userId = state.active?.userId ?? null;
      state.actions.expireActiveUser();
      if (serverId === null || userId === null) {
        return;
      }
      showToast(errorMessageOf('UNAUTHORIZED'), 'error');
      if (reloginRef.current) {
        return;
      }
      reloginRef.current = true;
      void (async () => {
        // 加密留存密码自动重登；成功 gate 已回壳，失败 gate 停留在登录屏（reloginServerId 上下文）
        await reloginWithStoredCredential(serverId, userId);
        reloginRef.current = false;
      })();
    });
    return unsubscribe;
  }, []);
}
