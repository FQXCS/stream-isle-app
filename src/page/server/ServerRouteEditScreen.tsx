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
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';
import {
  DEFAULT_ROUTE_NAME_SENTINEL,
  isDefaultRouteName,
  routesOf,
  useAccountStore,
} from '@/store/accountStore';
import { composeServerUrl, splitServerUrl } from '@/util/serverUrl';
import { newUid } from '@/util/uuid';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SERVER_ROUTE_EDIT>;

export function ServerRouteEditScreen({ route, navigation }: Props) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const { serverId, routeId } = route.params;
  const server = useAccountStore((state) => state.servers.find((item) => item.serverId === serverId));
  const editingRoute =
    routeId !== undefined && server !== undefined
      ? routesOf(server).find((item) => item.id === routeId)
      : undefined;
  const parts = splitServerUrl(editingRoute?.baseUrl ?? '');
  /** 默认线路名是存储哨兵：编辑时输入框留空、以「默认线路」作占位，保存空名写回哨兵 */
  const isDefaultRoute = editingRoute !== undefined && isDefaultRouteName(editingRoute.name);

  const [name, setName] = useState(isDefaultRoute ? '' : (editingRoute?.name ?? ''));
  const [https, setHttps] = useState(parts.https);
  const [host, setHost] = useState(parts.host);
  const [port, setPort] = useState(parts.port !== '' ? parts.port : '8096');

  const canSave =
    host.trim() !== '' && port.trim() !== '' && (name.trim() !== '' || isDefaultRoute);

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
      name: name.trim() !== '' ? name.trim() : DEFAULT_ROUTE_NAME_SENTINEL,
      baseUrl,
    });
    navigation.goBack();
  }, [canSave, editingRoute?.baseUrl, editingRoute?.id, host, https, name, navigation, port, server?.baseUrl, serverId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editingRoute !== undefined ? tr('server.editRouteTitle') : tr('server.addBackupRoute'),
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('common.save')}
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
            {tr('common.save')}
          </Text>
        </Pressable>
      ),
    });
  }, [canSave, editingRoute, handleSave, navigation, t.textPrimary, t.textTertiary, tr]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>{tr('server.formName')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={
            isDefaultRoute ? tr('server.defaultRoute') : tr('server.placeholderRequired')
          }
          placeholderTextColor={t.textSecondary}
        />
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formProtocol')}</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>HTTPS</Text>
          <Switch value={https} onValueChange={setHttps} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formAddress')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={setHost}
          placeholder={tr('server.placeholderHost')}
          placeholderTextColor={t.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formPort')}</Text>
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

      <Text style={styles.hint}>{tr('server.routeEditHint')}</Text>
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
