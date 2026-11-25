/**
 * TV 文件夹卡（TV-m2 §4.1，手机 FolderCard 的 TV 版）：与 TvPosterCard 网格帧同版式
 * （2:3 底 + 名称），封面来源与手机同口径——文件夹自身 Primary 优先；否则懒加载取目录内
 * 按当前排序首个带海报的条目封面（FolderCoverService 共享缓存）；都没有回退 📁 图标
 * （既有 emoji 例外口径）；底内右下角显示子项数量（Fields=ChildCount）。
 */
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem, SortByEnum } from '@/adapter/model';
import { useT } from '@/i18n';
import { loadFolderCover } from '@/service/FolderCoverService';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

interface TvFolderCardProps {
  item: MediaLibraryItem;
  /** 网格统一帧宽（TvWallGrid 实测列宽；高度沿用卡档 2:3 比例） */
  frameWidth: number;
  /** 排序（封面取样跟随排序；缺省名称升序） */
  sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' };
  onPress(): void;
}

export function TvFolderCard({ item, frameWidth, sort, onPress }: TvFolderCardProps) {
  const t = useTvTheme();
  const tr = useT();
  const sortBy = sort?.sortBy;
  const sortOrder = sort?.sortOrder;
  // 服务器给文件夹的「借用图」（URL 指向子条目）与排序无关，降级兜底；
  // 仅文件夹自身 Primary（URL 指向自己）优先，其余走排序取样
  const ownCoverUrl =
    item.posterImageUrl !== undefined && item.posterImageUrl.includes(`/Items/${item.id}/Images/`)
      ? item.posterImageUrl
      : undefined;
  // 封面状态带「目录+排序」键：列表复用/排序变化时键不匹配即视为未加载，避免串上一目录的旧封面
  const coverKey = `${item.id}|${sortBy ?? ''}|${sortOrder ?? ''}`;
  const [cover, setCover] = useState<{ key: string; url: string | null } | undefined>(undefined);

  useEffect(() => {
    // 文件夹自身封面优先（与排序无关），无需取样
    if (ownCoverUrl !== undefined) {
      return;
    }
    let cancelled = false;
    void loadFolderCover(item.id, sortBy, sortOrder).then((url) => {
      if (!cancelled) {
        setCover({ key: coverKey, url });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, ownCoverUrl, coverKey, sortBy, sortOrder]);

  // 自身图 > 排序取样结果（未返回前暂用服务器借用图占位）> 借用图兜底
  const lazyCoverUrl = cover?.key === coverKey ? (cover.url ?? undefined) : undefined;
  const coverUrl = ownCoverUrl ?? lazyCoverUrl ?? item.posterImageUrl;

  return (
    <TvPressable
      focusKind="card"
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={onPress}
      style={[styles.card, { width: frameWidth }]}
    >
      <View style={[styles.box, { height: Math.round((frameWidth * 3) / 2), borderColor: t.separator, backgroundColor: t.surface }]}>
        {coverUrl !== undefined ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={150}
            recyclingKey={item.id}
          />
        ) : (
          <Text style={styles.icon}>📁</Text>
        )}
        {item.childCount !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {tr('library.itemCount', { count: item.childCount })}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
        {item.name}
      </Text>
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  box: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cover: { width: '100%', height: '100%' },
  icon: { fontSize: 40 },
  countBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countText: { color: '#FFFFFF', fontSize: 14 },
  name: { fontSize: 16, fontWeight: '600' },
});
