/**
 * 照片库相册网格（M5 文档 §4.13；设计文档 §7.6）：FlashList 2 列，单元格 = 相册封面
 * （gridImageUrl 口径）+ 名称 + 「N 张」（childCount）。点击 → PhotoGridScreen
 * （经 PhotoLibraryScreen 内部状态切换，Library 路由内不新增 photo 网格路由）。
 * 照片域全程零播放会话（A21）。
 */
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import type { PhotoAlbumSummary } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PHOTO_ALBUM_GRID_COLUMNS } from '@/constant/photo';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError, type AppErrorCode } from '@/infra/error';
import { photoService } from '@/service/PhotoService';

interface PhotoAlbumScreenProps {
  libraryId: string;
  /** 点击相册（进入相册内网格，wrapper 内部切页） */
  onOpenAlbum: (albumId: string, albumName: string) => void;
}

export function PhotoAlbumScreen({ libraryId, onOpenAlbum }: PhotoAlbumScreenProps) {
  const t = useTheme();
  const styles = createStyles(t);
  // 迷你条让位（05 §4.10）：音频活跃时列表底部 padding 叠加迷你条高度，避免末行被遮
  const miniPlayerPadding = useMiniPlayerPadding();
  const [itemList, setItemList] = useState<PhotoAlbumSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      try {
        const result = await photoService.loadAlbums(libraryId, targetPage);
        setItemList((prev) => (targetPage === 0 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        setPage(targetPage);
        setErrorCode(null);
      } catch (err) {
        setErrorCode(err instanceof AppError ? err.code : 'UNKNOWN');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [libraryId]
  );

  // 聚焦加载（M2 详情页同口径：页面局部 state + useFocusEffect，05 §4.7）
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchPage(0);
    }, [fetchPage])
  );

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || errorCode !== null || itemList.length >= total) {
      return;
    }
    setLoadingMore(true);
    void fetchPage(page + 1);
  }, [loading, loadingMore, errorCode, itemList.length, total, page, fetchPage]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(0);
    setRefreshing(false);
  }, [fetchPage]);

  if (errorCode !== null && itemList.length === 0) {
    return (
      <View style={styles.fill}>
        <ErrorView error={new AppError(errorCode)} onRetry={() => void fetchPage(0)} />
      </View>
    );
  }
  if (loading) {
    return (
      <View style={styles.fill}>
        <ActivityIndicator style={styles.loading} color={t.accent} />
      </View>
    );
  }
  if (itemList.length === 0) {
    return (
      <View style={styles.fill}>
        <EmptyView title="暂无相册" />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlashList
        data={itemList}
        numColumns={PHOTO_ALBUM_GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: PhotoAlbumSummary }) => (
          <Pressable
            style={styles.cell}
            onPress={() => onOpenAlbum(item.id, item.name)}
          >
            {item.posterImageUrl !== undefined ? (
              <Image
                source={{ uri: item.posterImageUrl }}
                style={styles.cover}
                contentFit="cover"
                transition={200}
                recyclingKey={item.id}
              />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Text style={styles.fallbackText}>🖼</Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.count}>{item.childCount} 张</Text>
          </Pressable>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={t.accent} /> : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={t.accent} />
        }
        contentContainerStyle={[styles.gridContent, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridContent: { paddingHorizontal: SPACING.m, paddingBottom: SPACING.xl },
  cell: { flex: 1, gap: 4, padding: SPACING.xs },
  cover: {
    aspectRatio: 1,
    borderRadius: POSTER_RADIUS,
    backgroundColor: t.surface,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: t.textSecondary, fontSize: 28 },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  count: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  footer: { paddingVertical: SPACING.l },
});
