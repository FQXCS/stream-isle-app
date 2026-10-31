/**
 * 照片库布局包装（M5 文档 §4.12/§4.13）：Library 路由按 MediaLibrary.type=PHOTO 的布局分支。
 * 相册网格 ↔ 相册内网格为库页内部状态切换（不新增 photo 网格路由，M5 路由增量仅
 * AlbumDetail/NowPlaying/PhotoViewer 三个，05 §4.15）；PhotoViewer 为独立全屏路由。
 */
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { PhotoAlbumScreen } from '@/page/photo/PhotoAlbumScreen';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';

interface PhotoLibraryScreenProps {
  libraryId: string;
}

export function PhotoLibraryScreen({ libraryId }: PhotoLibraryScreenProps) {
  const t = useTheme();
  const styles = createStyles(t);
  // null = 相册网格；非 null = 指定相册内的 3 列网格
  const [openedAlbum, setOpenedAlbum] = useState<{ id: string; name: string } | null>(null);

  return (
    <View style={styles.fill}>
      {openedAlbum === null ? (
        <PhotoAlbumScreen
          libraryId={libraryId}
          onOpenAlbum={(id, name) => setOpenedAlbum({ id, name })}
        />
      ) : (
        <PhotoGridScreen
          key={openedAlbum.id}
          albumId={openedAlbum.id}
          albumName={openedAlbum.name}
          onBack={() => setOpenedAlbum(null)}
        />
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
});
