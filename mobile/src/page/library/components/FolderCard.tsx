/**
 * 文件夹卡（文件夹视图的目录格，M7 增量）：与 PosterCard 同版式（2:3 底 + 名称）。
 * 封面来源：文件夹自身 Primary 优先；否则懒加载取目录内按当前排序首个带海报的条目封面
 * （FolderCoverService，带缓存与并发上限）；服务器给文件夹的「借用图」与排序无关，仅作占位/兜底；
 * 都没有则回退 📁 图标。
 * 底内右下角显示子项数量（Fields=ChildCount）。
 */
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem, SortByEnum } from '@/adapter/model';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import { loadFolderCover } from '@/service/FolderCoverService';

interface FolderCardProps {
  item: MediaLibraryItem;
  /** 排序（封面取样跟随排序；缺省名称升序） */
  sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' };
}

export function FolderCard({ item, sort }: FolderCardProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
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
    <View style={styles.card}>
      <View style={styles.box}>
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
      <Text style={styles.name} numberOfLines={2}>
        {item.name}
      </Text>
    </View>
  );
}


const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: { flex: 1, gap: 4 },
    box: {
      aspectRatio: 2 / 3,
      borderRadius: POSTER_RADIUS,
      borderWidth: 1,
      borderColor: t.separator,
      backgroundColor: t.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    cover: { width: '100%', height: '100%' },
    icon: { fontSize: 40 },
    countBadge: {
      position: 'absolute',
      right: SPACING.xs,
      bottom: SPACING.xs,
      paddingHorizontal: SPACING.s,
      paddingVertical: 1,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    countText: { color: '#FFFFFF', fontSize: FONT_SIZE.body - 2 },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  });
