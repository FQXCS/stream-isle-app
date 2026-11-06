/**
 * 观看历史页（M6 文档 §4.4.5/§4.10；设计文档 §10.2 History 行）：
 * 服务端已看条目（电影/剧集集）按观看时间倒序分页展示，点进详情，下拉刷新；
 * 入口：首页头部右侧图标 + 设置页「观看历史」行。分页沿用海报墙 StartIndex/Limit（PAGE_SIZE）。
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { HistoryEntry } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { AppError, errorMessageOf } from '@/infra/error';
import { ROUTES } from '@/constant/navigation';
import type { RootStackParamList } from '@/page/navigation/types';
import { loadHistory } from '@/service/BrowseService';
import { formatDate } from '@/util/format';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HistoryScreen() {
  const t = useTheme();
  const tr = useT();
  const navigation = useNavigation<NavigationProp>();
  const miniPadding = useMiniPlayerPadding();

  const [entryList, setEntryList] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<AppError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  /** 已加载页码（下一页 = page + 1；loadHistory(page) 服务端分页） */
  const pageRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await loadHistory(0);
      pageRef.current = 0;
      setEntryList(result.items);
      setTotal(result.total);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
      setStatus('error');
    }
  }, []);

  // 聚焦即刷新（补报完成/网页端标记已看后回到本页同步，A8）
  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await loadHistory(0);
      pageRef.current = 0;
      setEntryList(result.items);
      setTotal(result.total);
      setError(null);
    } catch {
      // 下拉刷新失败保留旧数据（下次再试）
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** 加载下一页（onEndReached；按已加载长度判定是否还有更多） */
  const loadNextPage = useCallback(async () => {
    if (loadingMore || entryList.length >= total) {
      return;
    }
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await loadHistory(nextPage);
      pageRef.current = nextPage;
      setEntryList((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...result.items.filter((entry) => !seen.has(entry.id))];
      });
    } catch (err) {
      showToast(errorMessageOf(err instanceof AppError ? err.code : 'UNKNOWN'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [entryList.length, loadingMore, total]);

  if (status === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <Text style={[styles.title, { color: t.textPrimary }]}>{tr('history.title')}</Text>
        <LoadingView />
      </View>
    );
  }

  if (status === 'error' && error !== null) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <Text style={[styles.title, { color: t.textPrimary }]}>{tr('history.title')}</Text>
        <ErrorView error={error} onRetry={() => void loadFirstPage()} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.textPrimary }]}>{tr('history.title')}</Text>
      {entryList.length === 0 ? (
        <EmptyView title={tr('history.empty')} subtitle={tr('history.emptyHint')} />
      ) : (
        <FlatList
          data={entryList}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: t.surface },
                pressed && styles.pressed,
              ]}
              onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
            >
              {item.posterImageUrl !== undefined ? (
                <Image source={{ uri: item.posterImageUrl }} style={styles.poster} contentFit="cover" transition={150} recyclingKey={item.id} />
              ) : (
                <View style={[styles.poster, { backgroundColor: t.surfaceElevated }]} />
              )}
              <View style={styles.info}>
                <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
                  {item.seriesName !== undefined
                    ? `${item.seriesName} · S${item.parentIndexNumber ?? 0}E${item.indexNumber ?? 0} ${item.name}`
                    : item.name}
                </Text>
                <Text style={[styles.meta, { color: t.textSecondary }]} numberOfLines={1}>
                  {item.lastPlayedAtMs !== undefined
                    ? tr('history.watchedAt', { date: formatDate(item.lastPlayedAtMs) })
                    : ''}
                  {item.productionYear !== undefined
                    ? (item.lastPlayedAtMs !== undefined ? ' · ' : '') + String(item.productionYear)
                    : ''}
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: SPACING.xl + miniPadding }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.accent} />
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => void loadNextPage()}
          ListFooterComponent={loadingMore ? <LoadingView /> : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: FONT_SIZE.header, fontWeight: '700', padding: SPACING.l, paddingBottom: SPACING.s },
  listContent: { paddingHorizontal: SPACING.l, gap: SPACING.s },
  row: {
    flexDirection: 'row',
    gap: SPACING.m,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.s,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  poster: { width: 44, height: 66, borderRadius: 6 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: FONT_SIZE.body },
  meta: { fontSize: FONT_SIZE.body - 2 },
});
