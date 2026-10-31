/**
 * 设置页「服务器管理」分区（04 文档 §4.5/§4.6）：每服务器一行（名称/地址/flavor 徽标/版本），
 * 点击展开操作（设为活跃/添加此服务器的用户/删除）；每服务器「忽略自签名证书」Switch
 * （白名单键 = 规范化 baseUrl，变化即时同步原生，04 §4.6）；版本过低警示徽标（M1 semver）。
 */
import { useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { SettingRow } from '@/component/SettingRow';
import { showToast } from '@/component/Toast';
import { MIN_EMBY_VERSION, MIN_JELLYFIN_VERSION } from '@/constant/server';
import { ROUTES } from '@/constant/navigation';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import type { ServerFlavor } from '@/adapter/model';
import type { RootStackParamList } from '@/page/navigation/types';
import { compareVersion } from '@/util/semver';
import { useAccountStore, type ServerAccount } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';

interface ServerSectionProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/** 展开操作的服务器 id（单开） */
export function ServerSection({ navigation }: ServerSectionProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const servers = useAccountStore((state) => state.servers);
  const active = useAccountStore((state) => state.active);
  const allowInsecureTls = useSettingsStore((state) => state.allowInsecureTls);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** 版本过低判定（M1 semver 口径复用，04 §4.5「复用 M1 semver 判定」） */
  const isVersionTooLow = (flavor: ServerFlavor, version: string): boolean => {
    const minVersion = flavor === 'JELLYFIN' ? MIN_JELLYFIN_VERSION : MIN_EMBY_VERSION;
    return version !== '' && compareVersion(version, minVersion) < 0;
  };

  /** 设为活跃：切到该服务器的活跃用户（无则第一个用户） */
  const handleSetActiveServer = (server: ServerAccount) => {
    const userId = server.activeUserId ?? server.users[0]?.userId;
    if (userId === undefined) {
      showToast('该服务器暂无已登录用户，请先添加用户', 'error');
      return;
    }
    void useAccountStore.getState().actions.switchActiveUser(server.serverId, userId);
  };

  /** 删除服务器：Alert 确认 → accountStore.removeServer 级联清理（04 §4.7） */
  const handleRemoveServer = (server: ServerAccount) => {
    Alert.alert('删除服务器', `确定删除「${server.serverName}」及其全部账号吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void useAccountStore.getState().actions.removeServer(server.serverId);
        },
      },
    ]);
  };

  /** 忽略自签名证书开关（04 §4.6）：以规范化 baseUrl 增删白名单并即时同步原生 */
  const handleToggleTls = (server: ServerAccount, allowed: boolean) => {
    useSettingsStore.getState().actions.setInsecureTlsAllowed(server.baseUrl, allowed);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.groupTitle}>服务器管理</Text>
      {servers.map((server) => {
        const expanded = expandedId === server.serverId;
        const tlsAllowed = allowInsecureTls.includes(server.baseUrl);
        return (
          <View key={server.serverId} style={styles.serverBlock}>
            <SettingRow
              label={server.serverName || '未命名服务器'}
              description={server.baseUrl}
              badge={{
                text: isVersionTooLow(server.flavor, server.version)
                  ? `${server.flavor} 版本过低`
                  : server.flavor,
                danger: isVersionTooLow(server.flavor, server.version),
              }}
              value={server.version}
              onPress={() => setExpandedId(expanded ? null : server.serverId)}
              showArrow
            />
            {expanded && (
              <View style={styles.actionPanel}>
                <Pressable
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  onPress={() => handleSetActiveServer(server)}
                >
                  <Text style={styles.actionText}>
                    {active?.serverId === server.serverId ? '当前活跃服务器' : '设为活跃'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  onPress={() =>
                    navigation.navigate(ROUTES.ONBOARDING_LOGIN, { serverId: server.serverId })
                  }
                >
                  <Text style={styles.actionText}>添加此服务器的用户</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  onPress={() => handleRemoveServer(server)}
                >
                  <Text style={[styles.actionText, styles.actionTextDanger]}>删除</Text>
                </Pressable>
                {/* 忽略自签名证书（04 §4.6）：行下风险提示沿用 M1 口径 */}
                <View style={styles.tlsRow}>
                  <View style={styles.tlsTextWrap}>
                    <Text style={styles.tlsLabel}>忽略自签名证书</Text>
                    <Text style={styles.tlsDescription}>
                      仅对该服务器生效；TLS 校验按 host:port 放宽，同主机反代多服务共享通道，此类部署建议使用可信证书
                    </Text>
                  </View>
                  <Switch
                    value={tlsAllowed}
                    onValueChange={(value) => handleToggleTls(server, value)}
                  />
                </View>
              </View>
            )}
          </View>
        );
      })}
      {servers.length === 0 && <Text style={styles.emptyHint}>尚未连接服务器</Text>}
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
  serverBlock: { gap: SPACING.xs },
  actionPanel: { gap: SPACING.xs, paddingLeft: SPACING.m },
  actionButton: {
    alignSelf: 'flex-start',
    borderRadius: POSTER_RADIUS,
    backgroundColor: t.bg,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  actionText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  actionTextDanger: { color: t.danger },
  tlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingVertical: SPACING.s,
  },
  tlsTextWrap: { flex: 1, gap: 2 },
  tlsLabel: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  tlsDescription: { color: t.textSecondary, fontSize: FONT_SIZE.body - 2 },
  emptyHint: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  pressed: { opacity: 0.7 },
});
