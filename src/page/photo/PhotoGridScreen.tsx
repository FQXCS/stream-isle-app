/**
 * 照片网格（M5 文档 §4.13；M7 调整）：FlashList numColumns=3 等宽方格 + 服务端分页（照片页大小 60），
 * 图片按格子尺寸请求（getPhotoCellMaxWidth = 格宽×dpr）；expo-image cachePolicy=disk + recyclingKey。
 * 父容器可为库 id（「图片」段 = 全部图片，Recursive=true）或相册 id；排序由库页排序菜单传入。
 * 点击任意格 → PhotoViewer 路由，携带当前已加载片段与 initialIndex（后续页由查看器续载）。
 */
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';

import type { PhotoItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PHOTO_GRID_COLUMNS } from '@/constant/photo';
import { ROUTES } from '@/constant/navigation';
import { type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError, type AppErrorCode } from '@/infra/error';
import { useT } from '@/i18n';
import { photoService } from '@/service/PhotoService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import type { RootStackParamList } from '@/page/navigation/types';
import { getPhotoCellMaxWidth, getPhotoViewerMaxWidth } from '@/util/photo';

type WallNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PhotoGridScreenProps {
  /** 照片父容器 id：库 id（全部图片）或相册/目录 id */
  parentId: string;
  /** 底部相册名轻标题（不传则不显示） */
  title?: string;
  /** 排序（库页排序菜单；缺省名称升序） */
  sort?: LibrarySortState;
  /** 空态文案（缺省「暂无照片」，由本组件按当前语言取） */
  emptyTitle?: string;
}

export function PhotoGridScreen({ parentId, title, sort, emptyTitle }: PhotoGridScreenProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<WallNavigationProp>();
  const { width: windowWidth, scale: pixelRatio } = useWindowDimensions();
  // 格子请求宽 = ceil(窗口宽 ÷ 列数 × dpr)；查看器宽 = ceil(窗口宽 × dpr)（设计 §7.6 宽度策略，
  // 与 PhotoViewerScreen 续载路径同口径——viewerImageUrl 由 adapter 预拼，网格页一次定版）
  const gridMaxWidth = getPhotoCellMaxWidth(windowWidth, pixelRatio, PHOTO_GRID_COLUMNS);
  const viewerMaxWidth = getPhotoViewerMaxWidth(windowWidth, pixelRatio);
  // 迷你条让位（05 §4.10）：音频活跃时网格底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();

  const sortBy = sort?.sortBy;
  const sortOrder = sort?.sortOrder;

  const [itemList, setItemList] = useState<PhotoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      try {
        const result = await photoService.loadPhotos(
          parentId,
          targetPage,
          { gridMaxWidth, viewerMaxWidth },
          sortBy !== undefined && sortOrder !== undefined ? { sortBy, sortOrder } : undefined
        );
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
    // gridMaxWidth 随窗口尺寸派生（正常浏览不变）；账号切换/排序变化由父级重挂载或依赖变化兜底
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parentId, sortBy, sortOrder]
  );

  // 聚焦与排序变化：重置拉第一页（M2 详情页同口径：页面局部 state + useFocusEffect，05 §4.7）
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
        <EmptyView title={emptyTitle ?? tr('photo.empty')} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlashList
        data={itemList}
        numColumns={PHOTO_GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }: { item: PhotoItem; index: number }) => (
          <Pressable
            style={styles.cell}
            onPress={() =>
              navigation.navigate(ROUTES.PHOTO_VIEWER, {
                albumId: parentId,
                totalCount: total,
                photoList: itemList,
                initialIndex: index,
              })
            }
          >
            <Image
              source={{ uri: item.gridImageUrl }}
              style={styles.photo}
              contentFit="cover"
              transition={120}
              cachePolicy="disk"
              recyclingKey={item.id}
            />
          </Pressable>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={t.accent} /> : null}
        contentContainerStyle={[styles.gridContent, { paddingBottom: 24 + miniPlayerPadding }]}
      />
      {/* 相册名轻标题（页内自绘，不遮内容；「全部图片」等无标题场景不渲染） */}
      {title !== undefined && (
        <Text style={styles.albumTitle} numberOfLines={1}>
          {title}
        </Text>
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridContent: {},
  cell: { flex: 1, padding: 1 },
  photo: { aspectRatio: 1, backgroundColor: t.surface },
  albumTitle: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: t.textSecondary,
    fontSize: 12,
    paddingVertical: 4,
  },
  footer: { paddingVertical: 16 },
});
