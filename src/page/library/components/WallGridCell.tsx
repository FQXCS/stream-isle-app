/**
 * 海报墙网格单元（M8 增量）：承载卡片点击与长按。
 * 长按时测量单元屏幕矩形（measureInWindow）供锚定菜单定位，菜单出现在卡片下方。
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { PosterCard } from '@/component/PosterCard';
import { SPACING } from '@/constant/theme';
import { bookSizeService } from '@/service/BookSizeService';
import { formatBytes } from '@/util/formatBytes';

interface WallGridCellProps {
  item: MediaLibraryItem;
  /** 收藏筛选下已取消收藏的卡片淡化置灰（04 §4.4） */
  dimmed: boolean;
  onPress: () => void;
  onLongPress: (item: MediaLibraryItem, anchor: AnchorRect) => void;
  onToggleFavorite?: (item: MediaLibraryItem) => void;
}

export function WallGridCell({
  item,
  dimmed,
  onPress,
  onLongPress,
  onToggleFavorite,
}: WallGridCellProps) {
  const cellRef = useRef<ComponentRef<typeof Pressable> | null>(null);
  // 图书卡片：Emby/Jellyfin 列表不带文件大小，惰性探测后以副标题展示（缓存 + 并发上限在服务内）
  const [bookSize, setBookSize] = useState<{ itemId: string; text: string } | undefined>(undefined);
  useEffect(() => {
    if (item.type !== 'Book') {
      return;
    }
    let cancelled = false;
    void bookSizeService.loadSize(item.id).then((bytes) => {
      if (!cancelled && bytes !== null) {
        setBookSize({ itemId: item.id, text: formatBytes(bytes) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.type]);
  // 列表复用组件时按 itemId 匹配，避免上一本书的大小短暂显示到新卡片
  const subtextOverride = bookSize?.itemId === item.id ? bookSize.text : undefined;
  return (
    <Pressable
      ref={cellRef}
      style={styles.cell}
      delayLongPress={350}
      onPress={onPress}
      onLongPress={() => {
        cellRef.current?.measureInWindow((x, y, width, height) => {
          onLongPress(item, { x, y, width, height });
        });
      }}
    >
      <PosterCard
        item={item}
        dimmed={dimmed}
        onToggleFavorite={onToggleFavorite}
        subtextOverride={subtextOverride}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 网格单元留白：卡间 8pt、行间 12pt，外边距与卡间距协调
  cell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
});
