/**
 * 添加 / 编辑备用线路：名称 + 协议 + 服务器地址 + 端口号。
 * 保存后写入该服务器的线路列表（主线路同样可编辑）；地址非法时禁止保存。
 */
import { useCallback, useLayoutEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { routesOf, useAccountStore } from '@/store/accountStore';
import { composeServerUrl, splitServerUrl } from '@/util/serverUrl';
import { newUid } from '@/util/uuid';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SERVER_ROUTE_EDIT>;

export function ServerRouteEditScreen({ route, navigation }: Props) {
  const t = useTheme();
  const styles = createStyles(t);
  const { serverId, routeId } = route.params;
  const server = useAccountStore((state) => state.servers.find((item) => item.serverId === serverId));
  const editingRoute =
    routeId !== undefined && server !== undefined
      ? routesOf(server).find((item) => item.id === routeId)
      : undefined;
  const parts = splitServerUrl(editingRoute?.baseUrl ?? '');

  const [name, setName] = useState(editingRoute?.name ?? '');
  const [https, setHttps] = useState(parts.https);
  const [host, setHost] = useState(parts.host);
  const [port, setPort] = useState(parts.port !== '' ? parts.port : '8096');

  const canSave = name.trim() !== '' && host.trim() !== '' && port.trim() !== '';

  const handleSave = useCallback(() => {
    if (!canSave) {
      return;
    }
    // 备用线路沿用服务器的子路径（反代部署下路径是地址的一部分）
    const routePath = splitServerUrl(editingRoute?.baseUrl ?? server?.baseUrl ?? '').path;
    const baseUrl = composeServerUrl({ https, host, port, path: routePath });
    if (baseUrl === null) {
      return;
    }
    useAccountStore.getState().actions.upsertRoute(serverId, {
      id: editingRoute?.id ?? newUid(),
      name: name.trim(),
      baseUrl,
    });
    navigation.goBack();
  }, [canSave, editingRoute?.baseUrl, editingRoute?.id, host, https, name, navigation, port, server?.baseUrl, serverId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editingRoute !== undefined ? '编辑线路' : '添加备用路线',
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="保存"
          disabled={!canSave}
          onPress={handleSave}
        >
          <Text
            style={{
              fontSize: FONT_SIZE.body,
              fontWeight: '600',
              color: canSave ? t.textPrimary : t.textTertiary,
            }}
          >
            保存
          </Text>
        </Pressable>
      ),
    });
  }, [canSave, editingRoute, handleSave, navigation, t.textPrimary, t.textTertiary]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>名称</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="必填"
          placeholderTextColor={t.textSecondary}
        />
      </View>

      <Text style={styles.sectionLabel}>协议</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>HTTPS</Text>
          <Switch value={https} onValueChange={setHttps} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>服务器地址</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={setHost}
          placeholder="必填（127.0.0.1/sample）"
          placeholderTextColor={t.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <Text style={styles.sectionLabel}>端口号</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          placeholder="8096"
          placeholderTextColor={t.textSecondary}
          keyboardType="number-pad"
        />
      </View>

      <Text style={styles.hint}>
        备用线路与服务器共用账号，无需重新登录；切换后立即生效，请求失败会自动切到下一条线路。
      </Text>
    </ScrollView>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: SPACING.l, paddingBottom: SPACING.xl, gap: SPACING.s },
    sectionLabel: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body,
      marginTop: SPACING.s,
      paddingHorizontal: SPACING.xs,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: POSTER_RADIUS,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.xs,
    },
    input: { color: t.textPrimary, fontSize: FONT_SIZE.body, paddingVertical: SPACING.m },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.s,
    },
    switchLabel: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    hint: { color: t.textSecondary, fontSize: FONT_SIZE.body - 2, paddingTop: SPACING.m },
  });
