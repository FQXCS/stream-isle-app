/**
 * 文件夹卡（文件夹视图的目录格，M7 增量）：与 PosterCard 同版式（2:3 底 + 名称）。
 * 封面来源：服务器给 Folder 图片时直接用；否则懒加载取目录内首个带海报的条目封面
 * （FolderCoverService，带缓存与并发上限），都没有则回退 📁 图标。
 * 底内右下角显示子项数量（Fields=ChildCount）。
 */
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import { loadFolderCover } from '@/service/FolderCoverService';

interface FolderCardProps {
  item: MediaLibraryItem;
}

export function FolderCard({ item }: FolderCardProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  // 服务器自带封面优先；没有则懒加载目录内首个条目的海报
  const [coverUrl, setCoverUrl] = useState<string | undefined>(item.posterImageUrl);

  useEffect(() => {
    if (coverUrl !== undefined) {
      return;
    }
    let cancelled = false;
    void loadFolderCover(item.id).then((url) => {
      if (!cancelled && url !== null) {
        setCoverUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, coverUrl]);

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
