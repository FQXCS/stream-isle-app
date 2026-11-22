/**
 * 全部媒体库列表（融合页「我的媒体 · 查看全部」入口）：
 * 沿用 M1 库列表样式（库卡片：库图 + 名称 + 数量），点击进入库页；下拉刷新。
 * 数据与融合页共用 browseStore 的库列表缓存（按 serverId:userId 隔离）。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import type { MediaLibrary } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { LibraryCard } from '@/component/LibraryCard';
import { LoadingView } from '@/component/LoadingView';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';
import { useAccountStore } from '@/store/accountStore';
import { librariesKeyOf, useBrowseStore } from '@/store/browseStore';
import { useLibraryManageStore } from '@/store/libraryManageStore';
import { applyManageOverride } from '@/util/libraryManage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LibraryListScreen() {
  const t = useTheme();
  const tr = useT();
  const navigation = useNavigation<NavigationProp>();
  const active = useAccountStore((state) => state.active);
  const key = active ? librariesKeyOf(active.serverId, active.userId) : null;
  const libraries = useBrowseStore((state) =>
    key !== null ? state.librariesByKey[key] : undefined
  );
  // 媒体管理本地覆盖（显隐/顺序），与融合页同口径
  const manageOverride = useLibraryManageStore((state) =>
    key !== null ? state.overrideByKey[key] : undefined
  );
  const [refreshing, setRefreshing] = useState(false);

  // 聚焦即刷新（与库页口径一致）
  useFocusEffect(
    useCallback(() => {
      if (key !== null) {
        void useBrowseStore.getState().actions.loadLibraries(key);
      }
    }, [key])
  );

  const handleRefresh = useCallback(async () => {
    if (key === null) {
      return;
    }
    setRefreshing(true);
    try {
      await useBrowseStore.getState().actions.loadLibraries(key);
    } finally {
      setRefreshing(false);
    }
  }, [key]);

  const handlePress = useCallback(
    (library: MediaLibrary) => {
      navigation.navigate(ROUTES.LIBRARY, { library });
    },
    [navigation]
  );

  if (libraries === undefined) {
    // 游客态（未添加服务器）直接空态；有账号但尚未返回时显示加载
    return active === null ? <EmptyView title={tr('library.emptyLibraries')} /> : <LoadingView />;
  }

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <FlatList
        data={applyManageOverride(libraries, manageOverride)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LibraryCard library={item} onPress={handlePress} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyView title={tr('library.emptyLibraries')} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.accent} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: SPACING.l, gap: SPACING.m },
});
