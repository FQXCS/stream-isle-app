/**
 * 媒体库 Tab（M1 文档 §4.9 Tab.Libraries / S9）：
 * useFocusEffect 触发 loadLibraries；库卡片列表 + 下拉刷新；
 * 点击 → navigate(LIBRARY, { library })（MUSIC/PHOTO 库内显示 M5 占位态）。
 */
import { useCallback, useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import type { MediaLibrary } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { LibraryCard } from '@/component/LibraryCard';
import { LoadingView } from '@/component/LoadingView';
import { ROUTES } from '@/constant/navigation';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { librariesKeyOf, useBrowseStore } from '@/store/browseStore';
import { useAccountStore } from '@/store/accountStore';
import type { RootStackParamList } from '@/page/navigation/types';

export function LibrariesScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const active = useAccountStore((state) => state.active);
  const libraries = useBrowseStore((state) =>
    active ? state.librariesByKey[librariesKeyOf(active.serverId, active.userId)] : undefined
  );

  const key = active ? librariesKeyOf(active.serverId, active.userId) : null;
  // 下拉刷新进行中状态（刷新指示器随请求生命周期显示/收回）
  const [refreshing, setRefreshing] = useState(false);

  /** useFocusEffect 触发加载（§4.9 Tab.Libraries 行） */
  useFocusEffect(
    useCallback(() => {
      if (key !== null) {
        useBrowseStore.getState().actions.loadLibraries(key);
      }
    }, [key])
  );

  /** 下拉刷新 */
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

  /** 点击库卡片：全部路由进入 Library，MUSIC/PHOTO 在库内显示 M5 占位态（§4.9） */
  const handlePress = useCallback(
    (library: MediaLibrary) => {
      navigation.navigate(ROUTES.LIBRARY, { library });
    },
    [navigation]
  );

  if (libraries === undefined) {
    return <LoadingView />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={libraries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LibraryCard library={item} onPress={handlePress} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyView title="没有可见的媒体库" />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={t.accent}
          />
        }
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  listContent: { padding: SPACING.l, gap: SPACING.m },
});
