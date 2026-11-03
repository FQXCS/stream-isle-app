/**
 * 服务器排序（影视服务器页「⋯ → 排序」进入）：
 * 列表行展示 类型标志 + 名称 + 「Emby/Jellyfin - 地址」，长按右侧把手拖动调整顺序，
 * 右上「保存」写回 accountStore（全局生效），返回不保存则丢弃本次调整。
 */
import { useCallback, useLayoutEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DragHandle } from '@/component/DragHandle';
import { ServerFlavorLogo } from '@/component/ServerFlavorLogo';
import { SortableSettingsList } from '@/component/SortableSettingsList';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { useAccountStore, type ServerAccount } from '@/store/accountStore';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SERVER_SORT>;

export function ServerSortScreen({ navigation }: Props) {
  const t = useTheme();
  const styles = createStyles(t);
  const servers = useAccountStore((state) => state.servers);
  const [orderedList, setOrderedList] = useState<ServerAccount[]>(servers);

  const handleSave = useCallback(() => {
    useAccountStore.getState().actions.reorderServers(orderedList.map((server) => server.serverId));
    navigation.goBack();
  }, [navigation, orderedList]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '排序',
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="保存" onPress={handleSave}>
          <Text style={[styles.headerAction, { color: t.textPrimary }]}>保存</Text>
        </Pressable>
      ),
    });
  }, [handleSave, navigation, styles.headerAction, t.textPrimary]);

  return (
    <SortableSettingsList
      data={orderedList}
      keyExtractor={(item) => item.serverId}
      onReorder={setOrderedList}
      renderItem={(item, drag) => (
        <View style={[styles.row, { backgroundColor: t.surface }]}>
          <ServerFlavorLogo flavor={item.flavor} size={34} />
          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={1}>
              {item.serverName || '未命名服务器'}
            </Text>
            <Text style={styles.description} numberOfLines={1}>
              {item.flavor === 'EMBY' ? 'Emby' : 'Jellyfin'} - {item.baseUrl}
            </Text>
          </View>
          <DragHandle onLongPress={drag} />
        </View>
      )}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    headerAction: { fontSize: FONT_SIZE.body, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      borderRadius: POSTER_RADIUS,
      padding: SPACING.m,
      marginBottom: SPACING.s,
    },
    meta: { flex: 1, gap: 2 },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
    description: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
  });
