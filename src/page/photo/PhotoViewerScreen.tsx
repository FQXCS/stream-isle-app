/**
 * 全屏照片查看器（M5 文档 §4.13/§4.14；设计文档 §7.6/§10.1 沉浸黑底）：
 * react-native-image-viewing 单文件封装（缩放上限用库内部默认值，不自行放开，防大图 OOM）。
 * 双指缩放/双击放大/左右翻页/下滑关闭禁用（照片误滑关闭代价高，关闭仅返回键/关闭按钮）。
 * 顶部信息条（文件名/拍摄日期）随 index 切换；底部页码（分母 = totalCount，缺失降级
 * 「{index+1} / 已加载 N」）+ 保存按钮 + 长按菜单（保存/查看原图）。
 * 续载：距已载片段末尾 PHOTO_VIEWER_PRELOAD_REMAINING 张时自动拉下一页追加（A17 跨片段连续翻页）。
 * 查看原图：当前页切换 originalImageUrl（可切回），原图仅显式动作加载（§4.6 防 OOM 第一道防线）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import ImageViewing from 'react-native-image-viewing';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { PhotoItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { PHOTO_PAGE_SIZE, PHOTO_VIEWER_PRELOAD_REMAINING } from '@/constant/photo';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { errorMessageOf } from '@/infra/error';
import { photoService } from '@/service/PhotoService';
import { formatDate } from '@/util/format';
import { getPhotoViewerMaxWidth } from '@/util/photo';

interface PhotoViewerParams {
  albumId: string;
  /** 服务端总数（页码分母；= 相册 childCount） */
  totalCount: number;
  /** 当前已加载片段（路由初始值 + 续载追加） */
  photoList: PhotoItem[];
  initialIndex: number;
}

/** 保存到本地相册（§4.14 流程；GIF 保存后仍为动图）+ 反馈 toast */
async function savePhotoWithFeedback(photo: PhotoItem): Promise<void> {
  try {
    await photoService.saveToGallery(photo);
    showToast('已保存到 Stream Isle 相册', 'info');
  } catch (err) {
    const code = (err as { code?: string }).code;
    showToast(
      errorMessageOf(
        code === 'PHOTO_SAVE_PERMISSION_DENIED' ? 'PHOTO_SAVE_PERMISSION_DENIED' : 'PHOTO_SAVE_FAILED'
      ),
      'error'
    );
  }
}

export function PhotoViewerScreen() {
  const route = useRoute<{ key: string; name: string; params: PhotoViewerParams }>();
  const navigation = useNavigation();
  const { albumId, totalCount: initialTotal, photoList: initialList, initialIndex } = route.params;
  const { width: windowWidth, scale: pixelRatio } = useWindowDimensions();

  const [photoList, setPhotoList] = useState<PhotoItem[]>(initialList);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [index, setIndex] = useState(initialIndex);
  // 下一续载页码：初始片段长度换算（首页 60/页）
  const nextPageRef = useRef(Math.ceil(initialList.length / PHOTO_PAGE_SIZE));
  const [loadingMore, setLoadingMore] = useState(false);
  // 当前查看原图的页下标（null = 全部用缩放图；切页自动复位）
  const [originalIndex, setOriginalIndex] = useState<number | null>(null);

  /** 续载下一页并追加（失败静默：再次翻到边界时自然重试） */
  const loadMore = useCallback(async () => {
    if (loadingMore || photoList.length >= totalCount) {
      return;
    }
    setLoadingMore(true);
    try {
      const result = await photoService.loadPhotos(albumId, nextPageRef.current, {
        gridMaxWidth: getPhotoViewerMaxWidth(windowWidth, pixelRatio),
        viewerMaxWidth: getPhotoViewerMaxWidth(windowWidth, pixelRatio),
      });
      nextPageRef.current += 1;
      setPhotoList((prev) => [...prev, ...result.items]);
      setTotalCount(result.total);
    } catch {
      // 续载失败静默（查看器内不打断浏览）
    } finally {
      setLoadingMore(false);
    }
  }, [albumId, loadingMore, photoList.length, totalCount, windowWidth, pixelRatio]);

  /** 翻页同步：复位原图态 + 触发续载（距末尾 PRELOAD_REMAINING 张内） */
  const handleIndexChange = useCallback(
    (next: number) => {
      setIndex(next);
      setOriginalIndex(null);
      if (next >= photoList.length - PHOTO_VIEWER_PRELOAD_REMAINING) {
        void loadMore();
      }
    },
    [photoList.length, loadMore]
  );

  // 图片源只在片段追加/原图切换时变化；普通翻页保持数组引用不变，避免查看器内列表重渲染
  const images = useMemo(
    () =>
      photoList.map((photo, i) => ({
        uri: i === originalIndex ? photo.originalImageUrl : photo.viewerImageUrl,
      })),
    [photoList, originalIndex]
  );

  const currentPhoto = photoList[index] as PhotoItem | undefined;
  const viewingOriginal = originalIndex !== null;

  /** 长按菜单：保存到本地相册 / 查看原图（§4.13/§4.14） */
  const handleLongPress = useCallback(() => {
    if (currentPhoto === undefined) {
      return;
    }
    Alert.alert(currentPhoto.fileName ?? currentPhoto.name, undefined, [
      {
        text: '查看原图',
        onPress: () => {
          setOriginalIndex(index);
        },
      },
      {
        text: '保存到本地相册',
        onPress: () => {
          void savePhotoWithFeedback(currentPhoto);
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  }, [currentPhoto, index]);

  return (
    <View style={styles.fill}>
      <ImageViewing
        images={images}
        // 固定初始索引：库以 imageIndex 作为内部 key，回传实时索引会整棵重建（Modal 重播淡入 + 图片重载闪屏）
        imageIndex={initialIndex}
        visible
        doubleTapToZoomEnabled
        swipeToCloseEnabled={false}
        backgroundColor={COLORS.bg}
        onRequestClose={() => navigation.goBack()}
        onImageIndexChange={handleIndexChange}
        onLongPress={handleLongPress}
        HeaderComponent={() => (
          <HeaderComponent
            photo={currentPhoto}
            onClose={() => navigation.goBack()}
            viewingOriginal={viewingOriginal}
          />
        )}
        FooterComponent={() => (
          <FooterComponent
            index={index}
            totalCount={totalCount}
            loadedCount={photoList.length}
            loadingMore={loadingMore}
            viewingOriginal={viewingOriginal}
            onToggleOriginal={() => {
              setOriginalIndex((prev) => (prev === null ? index : null));
            }}
            onSave={() => {
              if (currentPhoto !== undefined) {
                void savePhotoWithFeedback(currentPhoto);
              }
            }}
          />
        )}
      />
    </View>
  );
}

/** 顶部信息条：文件名 + 拍摄日期（随 index 切换）+ 关闭按钮 */
function HeaderComponent({
  photo,
  onClose,
  viewingOriginal,
}: {
  photo: PhotoItem | undefined;
  onClose: () => void;
  viewingOriginal: boolean;
}) {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={8} onPress={onClose} accessibilityLabel="关闭">
        <AppIcon name="close" size={16} color={COLORS.textPrimary} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.fileName} numberOfLines={1}>
          {photo?.fileName ?? photo?.name ?? ''}
        </Text>
        {photo?.takenAtMs !== undefined && (
          <Text style={styles.takenAt}>{formatDate(photo.takenAtMs)}</Text>
        )}
        {viewingOriginal && <Text style={styles.originalBadge}>原图</Text>}
      </View>
    </View>
  );
}

/** 底部页码 + 保存/查看原图按钮 */
function FooterComponent({
  index,
  totalCount,
  loadedCount,
  loadingMore,
  viewingOriginal,
  onToggleOriginal,
  onSave,
}: {
  index: number;
  totalCount: number;
  loadedCount: number;
  loadingMore: boolean;
  viewingOriginal: boolean;
  onToggleOriginal: () => void;
  onSave: () => void;
}) {
  const hasServerTotal = totalCount > 0;
  return (
    <View style={styles.footer}>
      <Pressable hitSlop={8} onPress={onToggleOriginal}>
        <Text style={styles.footerAction}>{viewingOriginal ? '看缩放图' : '查看原图'}</Text>
      </Pressable>
      <Text style={styles.pageText}>
        {hasServerTotal
          ? `${index + 1} / ${totalCount}`
          : `${index + 1} / 已加载 ${loadedCount}`}
        {loadingMore ? ' · 加载中…' : ''}
      </Text>
      <Pressable hitSlop={8} onPress={onSave}>
        <Text style={styles.footerAction}>保存</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.s,
  },
  headerCenter: { flex: 1, gap: 2 },
  fileName: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  takenAt: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body },
  originalBadge: { color: COLORS.accent, fontSize: FONT_SIZE.body },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.l,
  },
  footerAction: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  pageText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body },
});
