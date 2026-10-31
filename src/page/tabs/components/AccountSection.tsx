/**
 * 设置页「账号」分区（04 文档 §4.5）：活跃用户行（点击弹用户切换列表）、
 * 添加用户/添加服务器入口、退出登录（Alert 确认）。
 */
import { useMemo, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { RadioOptionSheet } from '@/component/RadioOptionSheet';
import { SettingRow } from '@/component/SettingRow';
import { showToast } from '@/component/Toast';
import { ROUTES } from '@/constant/navigation';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { logout } from '@/service/AuthService';
import type { RootStackParamList } from '@/page/navigation/types';
import { useAccountStore } from '@/store/accountStore';

interface AccountSectionProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/** 用户切换单选 key：`${serverId}:${userId}` */
type UserOptionKey = string;

export function AccountSection({ navigation }: AccountSectionProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const active = useAccountStore((state) => state.active);
  const servers = useAccountStore((state) => state.servers);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeServer = active
    ? servers.find((server) => server.serverId === active.serverId)
    : undefined;
  const activeUser = activeServer?.users.find((user) => user.userId === active?.userId);

  /** 用户切换选项：全部服务器的全部用户（同服务器多用户 / 跨服务器，04 §4.5） */
  const userOptionList = useMemo(() => {
    const optionList: { key: UserOptionKey; label: string }[] = [];
    servers.forEach((server) => {
      server.users.forEach((user) => {
        optionList.push({
          key: `${server.serverId}:${user.userId}`,
          label: `${user.userName} @ ${server.serverName}`,
        });
      });
    });
    return optionList;
  }, [servers]);

  const activeOptionKey = active ? `${active.serverId}:${active.userId}` : '';

  /** 切换活跃用户：M1 既有 switchActiveUser（整体刷新 + 复位 401 失效标志，04 §4.5） */
  const handleSwitchUser = (key: UserOptionKey) => {
    const [serverId, userId] = key.split(':');
    void useAccountStore.getState().actions.switchActiveUser(serverId, userId);
  };

  /** 退出登录：Alert 确认（04 §4.5）后走 AuthService.logout（token 删除 + 回登录页） */
  const handleLogout = () => {
    if (!active || loggingOut) {
      return;
    }
    Alert.alert('退出登录', `确定退出 ${activeUser?.userName ?? '当前用户'} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setLoggingOut(true);
            try {
              await logout(active.serverId, active.userId);
            } catch (err) {
              const message = err instanceof Error ? err.message : '退出失败';
              showToast(message, 'error');
            } finally {
              setLoggingOut(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.groupTitle}>账号</Text>
      <SettingRow
        label="活跃用户"
        description={
          activeServer !== undefined && activeUser !== undefined
            ? `${activeUser.userName} @ ${activeServer.serverName}`
            : '未登录'
        }
        // 头像（04 §4.5「头像 + 用户名 @ 服务器名」）：登录链路产出的 avatarUrl；
        // 用户存在但无头像传空串（通用占位），未登录不渲染头像
        avatarUrl={activeUser !== undefined ? (activeUser.avatarUrl ?? '') : undefined}
        onPress={userOptionList.length > 0 ? () => setSwitcherOpen(true) : undefined}
        showArrow={userOptionList.length > 0}
      />
      <SettingRow
        label="添加用户"
        description="为当前服务器追加账号"
        onPress={() =>
          activeServer !== undefined &&
          navigation.navigate(ROUTES.ONBOARDING_LOGIN, { serverId: activeServer.serverId })
        }
      />
      <SettingRow
        label="添加服务器"
        description="连接新的 Jellyfin / Emby 服务器"
        onPress={() => navigation.navigate(ROUTES.ONBOARDING_CONNECT)}
      />
      <SettingRow
        label={loggingOut ? '退出中…' : '退出登录'}
        onPress={handleLogout}
        showArrow={false}
      />
      <RadioOptionSheet
        title="切换用户"
        visible={switcherOpen}
        selectedKey={activeOptionKey}
        optionList={userOptionList}
        onSelect={handleSwitchUser}
        onClose={() => setSwitcherOpen(false)}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.l,
    gap: SPACING.s,
  },
  groupTitle: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '700' },
});
