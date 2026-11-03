/**
 * 线路管理（某服务器的全部线路）：主线路 + 备用线路列表。
 * 点击线路 = 切换到该地址（后续请求走当前线路，网络失败时 adapter 自动切下一条）；
 * 长按行 → 编辑 / 删除；导航头「+」添加备用线路。
 */
import { useLayoutEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnchorMenu, type AnchorRect, type AnchorMenuItem } from '@/component/AnchorMenu';
import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { activeRouteIdOf, routesOf, useAccountStore } from '@/store/accountStore';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SERVER_ROUTES>;

export function ServerRoutesScreen({ route, navigation }: Props) {
  const t = useTheme();
  const styles = createStyles(t);
  const { serverId } = route.params;
  const server = useAccountStore((state) => state.servers.find((item) => item.serverId === serverId));
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuRouteId, setMenuRouteId] = useState<string | null>(null);

  // 导航头：标题 + 右侧「+」（添加备用线路）
  useLayoutEffect(() => {
    navigation.setOptions({
      title: '线路管理',
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加备用线路"
          onPress={() => navigation.navigate(ROUTES.SERVER_ROUTE_EDIT, { serverId })}
        >
          <AppIcon name="plus" size={22} color={t.textPrimary} />
        </Pressable>
      ),
    });
  }, [navigation, serverId, t.textPrimary]);

  if (server === undefined) {
    return (
      <View style={[styles.container, styles.emptyBox, { backgroundColor: t.bg }]}>
        <Text style={styles.emptyText}>服务器不存在</Text>
      </View>
    );
  }

  const routeList = routesOf(server);
  const activeRouteId = activeRouteIdOf(server);

  const openMenu = (routeId: string, pageX: number, pageY: number) => {
    setMenuRouteId(routeId);
    setMenuAnchor({ x: pageX, y: pageY, width: 1, height: 1 });
  };

  const menuItemList: AnchorMenuItem[] = [
    {
      key: 'edit',
      label: '编辑',
      icon: 'edit',
      onPress: () => {
        if (menuRouteId !== null) {
          navigation.navigate(ROUTES.SERVER_ROUTE_EDIT, { serverId, routeId: menuRouteId });
        }
      },
    },
    {
      key: 'delete',
      label: '删除',
      icon: 'trash',
      tone: 'danger',
      onPress: () => {
        if (menuRouteId === null) {
          return;
        }
        const targetId = menuRouteId;
        Alert.alert('删除线路', '删除后该地址将不再参与故障转移，确定删除吗？', [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => {
              useAccountStore.getState().actions.removeRoute(serverId, targetId);
            },
          },
        ]);
      },
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {routeList.map((item) => {
          const active = item.id === activeRouteId;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                useAccountStore.getState().actions.setActiveRoute(serverId, item.id);
                showToast(`已切换到「${item.name}」`);
              }}
              onLongPress={(event) =>
                openMenu(item.id, event.nativeEvent.pageX, event.nativeEvent.pageY)
              }
              style={({ pressed }) => [styles.routeCard, pressed && styles.pressed]}
            >
              <View style={styles.routeMeta}>
                <Text style={styles.routeName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.routeUrl} numberOfLines={1}>
                  {item.baseUrl}
                </Text>
              </View>
              {active && <AppIcon name="check" size={18} color={t.accent} />}
            </Pressable>
          );
        })}
        <Text style={styles.hint}>
          当前线路请求失败时会自动切换到下一条线路；也可以点击线路手动切换。
        </Text>
      </ScrollView>
      <AnchorMenu
        anchor={menuAnchor}
        itemList={menuItemList}
        onClose={() => setMenuAnchor(null)}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: SPACING.l, gap: SPACING.m },
    routeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.surface,
      borderRadius: POSTER_RADIUS,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.m,
      gap: SPACING.m,
    },
    routeMeta: { flex: 1, gap: 2 },
    routeName: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
    routeUrl: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    hint: { color: t.textSecondary, fontSize: FONT_SIZE.body - 2, paddingTop: SPACING.s },
    emptyBox: { alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    pressed: { opacity: 0.7 },
  });
