/**
 * 全屏照片查看器（M5 文档 §4.13/§4.14；设计文档 §7.6/§10.1 沉浸黑底）：
 * react-native-image-viewing 单文件封装（缩放上限用库内部默认值，不自行放开，防大图 OOM）。
 * 双指缩放/双击放大/左右翻页/下滑关闭禁用（照片误滑关闭代价高，关闭仅返回键/关闭按钮）。
 * 沉浸渐变方案：overFullScreen 隐藏系统状态栏；顶/底栏黑色渐变遮罩保证任何图上可读；
 * 圆形图标按钮（关闭/信息/保存）+ 原图状态胶囊 + 页码胶囊；安全区适配。
 * 单击照片切换顶/底栏显隐（库补丁 onTap，与双击放大/长按/滑动消歧）；
 * 长按弹应用内底部动作面板（PhotoActionSheet），顶栏 ⓘ 进图片信息面板（PhotoInfoSheet）。
 * 顶部信息条（文件名/拍摄日期·分辨率/原图徽章）随 index 切换；底部页码（分母 = totalCount，
 * 缺失降级「{index+1} / 已加载 N」）。
 * 续载：距已载片段末尾 PHOTO_VIEWER_PRELOAD_REMAINING 张时自动拉下一页追加（A17 跨片段连续翻页）。
 * 查看原图：当前页切换 originalImageUrl（可切回），原图仅显式动作加载（§4.6 防 OOM 第一道防线）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import ImageViewing from 'react-native-image-viewing';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { PhotoItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { PHOTO_PAGE_SIZE, PHOTO_VIEWER_PRELOAD_REMAINING } from '@/constant/photo';
import { useImmersiveAccent } from '@/component/useTheme';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { errorMessageOf } from '@/infra/error';
import { t, useT } from '@/i18n';
import { PhotoActionSheet, PhotoInfoSheet } from '@/page/photo/PhotoSheets';
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
    showToast(t('photo.saved'), 'info');
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
  // 底部弹层：长按动作面板 / 图片信息面板（null=关闭）
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);

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

  /** 原图开关：当前页在缩放图/原图间切换（切页自动复位） */
  const toggleOriginal = useCallback(() => {
    setOriginalIndex((prev) => (prev === null ? index : null));
  }, [index]);

  /** 长按 → 应用内底部动作面板（替代系统 Alert） */
  const handleLongPress = useCallback(() => {
    if (currentPhoto !== undefined) {
      setActionSheetVisible(true);
    }
  }, [currentPhoto]);

  return (
    <View style={styles.fill}>
      <ImageViewing
        images={images}
        // 固定初始索引：库以 imageIndex 作为内部 key，回传实时索引会整棵重建（Modal 重播淡入 + 图片重载闪屏）
        imageIndex={initialIndex}
        visible
        // overFullScreen：Android 走透明 Modal，库 StatusBarManager 据此隐藏系统状态栏（沉浸）
        presentationStyle="overFullScreen"
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
            onInfo={() => setInfoSheetVisible(true)}
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
            onToggleOriginal={toggleOriginal}
            onSave={() => {
              if (currentPhoto !== undefined) {
                void savePhotoWithFeedback(currentPhoto);
              }
            }}
          />
        )}
      />
      <PhotoActionSheet
        photo={actionSheetVisible ? (currentPhoto ?? null) : null}
        viewingOriginal={viewingOriginal}
        onToggleOriginal={() => {
          setActionSheetVisible(false);
          toggleOriginal();
        }}
        onSave={() => {
          setActionSheetVisible(false);
          if (currentPhoto !== undefined) {
            void savePhotoWithFeedback(currentPhoto);
          }
        }}
        onInfo={() => {
          setActionSheetVisible(false);
          setInfoSheetVisible(true);
        }}
        onClose={() => setActionSheetVisible(false)}
      />
      <PhotoInfoSheet
        photo={infoSheetVisible ? (currentPhoto ?? null) : null}
        onClose={() => setInfoSheetVisible(false)}
      />
    </View>
  );
}

/** 顶部信息条：渐变遮罩 + 关闭/信息圆形按钮 + 文件名/日期·分辨率/原图徽章（随 index 切换） */
function HeaderComponent({
  photo,
  onClose,
  onInfo,
  viewingOriginal,
}: {
  photo: PhotoItem | undefined;
  onClose: () => void;
  onInfo: () => void;
  viewingOriginal: boolean;
}) {
  const { accent, accentOn } = useImmersiveAccent();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const takenAt = photo?.takenAtMs !== undefined ? formatDate(photo.takenAtMs) : '';
  const hasResolution = photo?.width !== undefined && photo?.height !== undefined;
  // 副标题：拍摄日期 · 分辨率（任一缺失则只显示有的部分）
  const subParts = [takenAt, hasResolution ? `${photo.width}×${photo.height}` : ''].filter(
    (part) => part !== ''
  );
  return (
    <View>
      <Scrim direction="top" />
      <View style={[styles.header, { paddingTop: insets.top + SPACING.s }]}>
        <RoundButton icon="close" label={tr('common.close')} onPress={onClose} />
        <View style={styles.headerCenter}>
          <View style={styles.nameRow}>
            <Text style={styles.fileName} numberOfLines={1}>
              {photo?.fileName ?? photo?.name ?? ''}
            </Text>
            {viewingOriginal && (
              <View style={[styles.originalBadge, { backgroundColor: accent }]}>
                <Text style={[styles.originalBadgeText, { color: accentOn }]}>
                  {tr('photo.originalBadge')}
                </Text>
              </View>
            )}
          </View>
          {subParts.length > 0 && <Text style={styles.subText}>{subParts.join(' · ')}</Text>}
        </View>
        <RoundButton icon="info" label={tr('photo.info')} onPress={onInfo} />
      </View>
    </View>
  );
}

/** 底部操作条：渐变遮罩 + 原图状态胶囊 + 页码胶囊 + 保存圆形按钮 */
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
  const { accent, accentOn } = useImmersiveAccent();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const hasServerTotal = totalCount > 0;
  const pageText = hasServerTotal
    ? `${index + 1} / ${totalCount}`
    : tr('photo.pageLoaded', { index: index + 1, loaded: loadedCount });
  return (
    <View>
      <Scrim direction="bottom" />
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.m }]}>
        <Pressable
          style={({ pressed }) => [
            styles.originalPill,
            viewingOriginal && { backgroundColor: accent },
            pressed && styles.pressed,
          ]}
          onPress={onToggleOriginal}
          accessibilityLabel={viewingOriginal ? tr('photo.viewScaled') : tr('photo.viewOriginal')}
        >
          <Text style={[styles.originalPillText, viewingOriginal && { color: accentOn }]}>
            {tr('photo.originalBadge')}
          </Text>
          {viewingOriginal && <AppIcon name="check" size={13} color={accentOn} />}
        </Pressable>
        <View style={styles.pagePill}>
          <Text style={styles.pageText}>
            {pageText}
            {loadingMore ? tr('photo.loadingMore') : ''}
          </Text>
        </View>
        <RoundButton icon="download" label={tr('photo.save')} onPress={onSave} />
      </View>
    </View>
  );
}

/** 圆形图标按钮（36pt 视觉 + 44pt 热区；纯图标按钮带无障碍标签） */
function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: 'close' | 'info' | 'download';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
      hitSlop={4}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <AppIcon name={icon} size={18} color={COLORS.textPrimary} />
    </Pressable>
  );
}

/** 顶/底黑色渐变遮罩（SVG 实现，免新增渐变依赖；pointerEvents 不拦截手势） */
function Scrim({ direction }: { direction: 'top' | 'bottom' }) {
  const isTop = direction === 'top';
  return (
    <Svg
      style={isTop ? styles.scrimTop : styles.scrimBottom}
      width="100%"
      height="100%"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="photoScrim" x1="0" y1={isTop ? '0' : '1'} x2="0" y2={isTop ? '1' : '0'}>
          <Stop offset="0" stopColor="#000000" stopOpacity={isTop ? 0.62 : 0.66} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#photoScrim)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 128 },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 132 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.s,
  },
  headerCenter: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  fileName: { flexShrink: 1, color: COLORS.textPrimary, fontSize: FONT_SIZE.body + 1, fontWeight: '500' },
  subText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.caption },
  originalBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  originalBadgeText: { fontSize: FONT_SIZE.caption - 1, fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
  },
  originalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  originalPillText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.caption, fontWeight: '500' },
  pagePill: {
    borderRadius: 14,
    paddingHorizontal: SPACING.m,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pageText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.caption },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  roundButtonPressed: { backgroundColor: 'rgba(255,255,255,0.26)' },
  pressed: { opacity: 0.7 },
});
