/**
 * TV 最小设置页（TV-m4 §4.1，侧栏第三项占位收口）：服务器分组（服务器卡 +
 * 账号行列表，当前活跃勾标）+ 退出登录 + 关于版本行。服务器切换 activateServer /
 * 账号切换 switchActiveUser 全走共享 accountStore（切换后首页数据经 browseStore key
 * 自然切换，m1 链路）；退出 AuthService.logout → active=null gate 自动回登录屏。
 * 退出二次确认 TV 自绘 overlay（按钮自环收口焦点，TV-m4-S4；RN Alert TV 焦点不可达不沿用）。
 * 焦点：全行 TvPressable row 态；LEFT 经 nextFocusLeft 逃逸到侧栏镜像代理
 * （代理挂本 ScrollView 子树内，与首页/搜索同构，TV-m1-S3）；BACK 关确认 overlay
 * 由页面 BackHandler 收口（m3 抽屉同款）。二级设置页/更新 UI 首版不出现（TV 设计 §1.2）。
 */
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';

import { APP_VERSION } from '@/constant/app';
import type { AppIconName } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { useT } from '@/i18n';
import { logout } from '@/service/AuthService';
import { useAccountStore, type ServerAccount, type ServerUser } from '@/store/accountStore';

import { TvPressable } from '@tv/component/TvPressable';
import { TvSettingRow } from '@tv/component/TvSettingRow';
import { TvSidebarProxy } from '@tv/component/TvSidebarProxy';
import { useTvTheme } from '@tv/component/useTvTheme';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvSettingsScreenProps {
  /** 侧栏镜像代理的图标/文案（Shell 当前 tab 下发，首页/搜索同构） */
  proxyIcon: AppIconName;
  proxyLabel: string;
  /** 代理实例 tag 上抛（行 nextFocusLeft 寻址；代理须挂本 ScrollView 内才可达） */
  onProxyTag(tag: number | null): void;
  /** 代理 CENTER 动作（Shell tab 循环切换） */
  onProxyPress(): void;
  /** 行 LEFT 逃逸目标（即代理 tag，Shell 下发回环） */
  escapeFocusUpTag?: number;
}

export function TvSettingsScreen({
  proxyIcon,
  proxyLabel,
  onProxyTag,
  onProxyPress,
  escapeFocusUpTag,
}: TvSettingsScreenProps) {
  const t = useTvTheme();
  const tr = useT();
  const servers = useAccountStore((state) => state.servers);
  const active = useAccountStore((state) => state.active);
  /** 退出二次确认 overlay 显隐 */
  const [confirmVisible, setConfirmVisible] = useState(false);
  /** 切换进行中（防 D-pad 连按并发切换） */
  const [switching, setSwitching] = useState(false);
  // overlay 关闭后焦点归还 Sign out 行（TV-m4-S4：fork 焦点命令 no-op、聚焦件卸载后
  // 焦点恢复不可靠——bump key 重挂该行 + hasTVPreferredFocus 领取，m1 首屏焦点同机制）
  const [signOutFocusKey, setSignOutFocusKey] = useState(0);
  const closeConfirm = useCallback(() => {
    setConfirmVisible(false);
    setSignOutFocusKey((key) => key + 1);
  }, []);

  // BACK 关确认 overlay（仅 overlay 开启时注册；关闭态壳 tab 无栈可退，不拦截）
  useEffect(() => {
    if (!confirmVisible) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeConfirm();
      return true;
    });
    return () => subscription.remove();
  }, [confirmVisible, closeConfirm]);

  /** 服务器卡确认：activateServer（内部 switchActiveUser 到该服务器活跃/首个用户） */
  const handleActivateServer = async (server: ServerAccount) => {
    if (switching || active?.serverId === server.serverId) {
      return;
    }
    setSwitching(true);
    try {
      const ok = await useAccountStore.getState().actions.activateServer(server.serverId);
      showToast(
        ok
          ? tr('tv.settingsSwitchedServer', {
              name: server.serverName || tr('server.unnamedServer'),
            })
          : tr('tv.settingsSwitchFailed'),
        ok ? 'info' : 'error'
      );
    } catch {
      showToast(tr('tv.settingsSwitchFailed'), 'error');
    } finally {
      setSwitching(false);
    }
  };

  /** 账号行确认：同服务器切账号（warmupToken + 写 active，首页数据随之切换） */
  const handleSwitchUser = async (server: ServerAccount, user: ServerUser) => {
    if (switching || (active?.serverId === server.serverId && active?.userId === user.userId)) {
      return;
    }
    setSwitching(true);
    try {
      await useAccountStore.getState().actions.switchActiveUser(server.serverId, user.userId);
      showToast(tr('tv.settingsSwitchedUser', { name: user.userName }), 'info');
    } catch {
      showToast(tr('tv.settingsSwitchFailed'), 'error');
    } finally {
      setSwitching(false);
    }
  };

  /** 确认退出：logout（deleteToken+removeUser+clearActive）→ gate 自动回登录屏 */
  const handleLogout = async () => {
    if (active === null) {
      return;
    }
    setConfirmVisible(false);
    try {
      await logout(active.serverId, active.userId);
    } catch {
      showToast(tr('tv.settingsLogoutFailed'), 'error');
    }
  };

  // 首屏焦点落首个服务器卡（gate 保证 active 存在，servers 非空）
  const firstServerId = servers[0]?.serverId;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* 侧栏镜像代理（LEFT 逃逸落点，CENTER 循环 tab；首页/搜索同构） */}
        <TvSidebarProxy icon={proxyIcon} label={proxyLabel} onTag={onProxyTag} onPress={onProxyPress} />
        <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>
          {tr('tv.settingsAccountSection')}
        </Text>
        {servers.map((server) => {
          const serverActive = active?.serverId === server.serverId;
          return (
            <View key={server.serverId} style={styles.serverGroup}>
              <TvSettingRow
                icon="server"
                label={server.serverName || tr('server.unnamedServer')}
                value={`${server.flavor} · ${server.version}`}
                selected={serverActive}
                hasTVPreferredFocus={server.serverId === firstServerId}
                nextFocusLeftTag={escapeFocusUpTag}
                onPress={() => void handleActivateServer(server)}
              />
              {server.users.map((user) => (
                <TvSettingRow
                  key={user.userId}
                  icon="account"
                  label={user.userName}
                  indented
                  selected={serverActive && active?.userId === user.userId}
                  nextFocusLeftTag={escapeFocusUpTag}
                  onPress={() => void handleSwitchUser(server, user)}
                />
              ))}
            </View>
          );
        })}
        <TvSettingRow
          key={`signout-${signOutFocusKey}`}
          icon="signOut"
          label={tr('tv.settingsLogout')}
          hasTVPreferredFocus={signOutFocusKey > 0 && !confirmVisible}
          nextFocusLeftTag={escapeFocusUpTag}
          onPress={() => setConfirmVisible(true)}
        />
        <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>{tr('settings.about')}</Text>
        {/* 关于版本行：纯展示不可聚焦（TV 更新 UI 首版不出现，form 接口已就绪） */}
        <TvSettingRow icon="info" label={tr('settings.version')} value={APP_VERSION} />
      </ScrollView>
      {confirmVisible && (
        <TvLogoutConfirmOverlay onCancel={closeConfirm} onConfirm={() => void handleLogout()} />
      )}
    </View>
  );
}

/**
 * 退出二次确认 overlay（TV-m4 §4.1）：居中面板，默认焦点落「取消」（安全侧）；
 * BACK 关闭由页面 BackHandler 收口，无点按 scrim。
 * 焦点收口不用 trapFocus（TV-m4-S4 实测：trap 命中走子树 FocusFinder，null 回退
 * 窗口级搜索——居中面板 UP 方向背后行可聚焦即逃逸，且 trap 绕过 nextFocus 无法叠自环）；
 * 改 m3-S4 SeekBar 同款自身 tag 自环：两按钮 UP/DOWN/外侧向自环留焦，左右互指显式闭环。
 */
function TvLogoutConfirmOverlay({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): void }) {
  const t = useTvTheme();
  const tr = useT();
  // 两按钮自身 tag（自环留焦目标，m3-S4 同款写法）
  const [cancelTag, setCancelTag] = useState<number | null>(null);
  const [confirmTag, setConfirmTag] = useState<number | null>(null);
  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <View style={styles.overlayBackdrop} pointerEvents="none" />
      <View style={[styles.overlayPanel, { backgroundColor: t.surface }]}>
        <Text style={[styles.overlayTitle, { color: t.textPrimary }]}>
          {tr('tv.settingsLogoutConfirmTitle')}
        </Text>
        <Text style={[styles.overlayDesc, { color: t.textSecondary }]}>
          {tr('tv.settingsLogoutConfirmDesc')}
        </Text>
        <View style={styles.overlayButtons}>
          <TvPressable
            focusKind="row"
            focusable
            hasTVPreferredFocus
            accessibilityRole="button"
            accessibilityLabel={tr('common.cancel')}
            style={styles.overlayButton}
            ref={(ref) => setCancelTag(findNodeHandleTagOf(ref))}
            nextFocusUp={cancelTag ?? undefined}
            nextFocusDown={cancelTag ?? undefined}
            nextFocusLeft={cancelTag ?? undefined}
            nextFocusRight={confirmTag ?? undefined}
            onPress={onCancel}
          >
            <Text style={[styles.overlayButtonText, { color: t.textPrimary }]}>
              {tr('common.cancel')}
            </Text>
          </TvPressable>
          <TvPressable
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={tr('tv.settingsLogout')}
            style={styles.overlayButton}
            ref={(ref) => setConfirmTag(findNodeHandleTagOf(ref))}
            nextFocusUp={confirmTag ?? undefined}
            nextFocusDown={confirmTag ?? undefined}
            nextFocusRight={confirmTag ?? undefined}
            nextFocusLeft={cancelTag ?? undefined}
            onPress={onConfirm}
          >
            <Text style={[styles.overlayButtonText, { color: t.danger }]}>
              {tr('tv.settingsLogout')}
            </Text>
          </TvPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginTop: 16 },
  serverGroup: { gap: 2 },
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayPanel: {
    width: 480,
    borderRadius: 20,
    padding: 28,
    gap: 12,
  },
  overlayTitle: { fontSize: 22, fontWeight: '700' },
  overlayDesc: { fontSize: 16, lineHeight: 24 },
  overlayButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  overlayButton: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  overlayButtonText: { fontSize: 18, fontWeight: '600' },
});
