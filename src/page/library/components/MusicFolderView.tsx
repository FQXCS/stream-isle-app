/**
 * 音乐库文件夹区（目录浏览）：Items?Recursive=false 逐级浏览，返回键回上一级（不设面包屑）。
 * 目录内是子文件夹/专辑时，用与视频库文件夹页一致的三列网格（FolderCard / PosterCard）；
 * 目录内是歌曲时用 SongRow 行列表（点歌 = 当前已加载歌曲从该曲起播）。
 */
import { useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AudioItem, MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { SongRow } from '@/component/SongRow';
import { showToast } from '@/component/Toast';
import { GRID_COLUMNS } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf } from '@/infra/error';
import { audioService } from '@/service/AudioService';
import { fetchFolderPage } from '@/service/BrowseService';
import { FolderCard } from '@/page/library/components/FolderCard';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { visibleFolderItems } from '@/util/library';
import type { RootStackParamList } from '@/page/navigation/types';

type LibraryNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 统一模型条目 → 播放用 AudioItem（目录区不携带艺人名，封面取海报图） */
function toAudioItem(item: MediaLibraryItem): AudioItem {
  return {
    id: item.id,
    name: item.name,
    runtimeMs: item.runtimeMs,
    coverImageUrl: item.posterImageUrl,
  };
}

/** 目录区可见条目（其余类型不渲染） */
function isVisibleItem(item: MediaLibraryItem): boolean {
  return item.type === 'Folder' || item.type === 'Audio' || item.type === 'MusicAlbum' || item.type === 'Playlist';
}

interface MusicFolderViewProps {
  /** 当前目录 id（库根或子目录） */
  folderId: string;
  /** 进入子文件夹（由页面维护路径栈） */
  onOpenFolder: (folder: MediaLibraryItem) => void;
}

export function MusicFolderView({ folderId, onOpenFolder }: MusicFolderViewProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<LibraryNavigationProp>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback((page) => fetchFolderPage(folderId, page), [folderId])
  );

  // 已加载的目录条目（其余类型过滤掉，避免出现空行；空文件夹不展示）
  const visibleList = useMemo(
    () => visibleFolderItems(state.itemList.filter(isVisibleItem)),
    [state.itemList]
  );
  // 目录内已加载歌曲：播放队列 = 该片段，点哪首从哪里起播
  const songList = useMemo(
    () => state.itemList.filter((item) => item.type === 'Audio').map(toAudioItem),
    [state.itemList]
  );
  // 子文件夹/专辑项（网格模式的数据源）
  const folderLikeList = useMemo(
    () => visibleList.filter((item) => item.type !== 'Audio'),
    [visibleList]
  );
  // 纯目录层用三列网格（与视频库一致）；含歌曲的目录用行列表
  const gridMode = folderLikeList.length > 0 && songList.length === 0;

  const handlePressSong = useCallback(
    (song: AudioItem) => {
      const index = songList.findIndex((item) => item.id === song.id);
      if (index < 0) {
        return;
      }
      void audioService.playQueue(songList, index).catch(() => {
        showToast(errorMessageOf('UNKNOWN'), 'error');
      });
    },
    [songList]
  );

  /** 子文件夹 / 专辑 / 歌单的点击 */
  const handlePressEntry = useCallback(
    (item: MediaLibraryItem) => {
      if (item.type === 'Folder') {
        onOpenFolder(item);
        return;
      }
      navigation.navigate(ROUTES.ALBUM_DETAIL, {
        kind: item.type === 'Playlist' ? 'playlist' : 'album',
        itemId: item.id,
      });
    },
    [navigation, onOpenFolder]
  );

  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (visibleList.length === 0) {
    return <EmptyView title="文件夹为空" />;
  }

  if (gridMode) {
    return (
      <FlashList
        // 网格/行两种模式切换必须换实例，否则 numColumns 变更会让 FlashList 布局错乱
        key="folder-grid"
        data={folderLikeList}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) => (
          <Pressable onPress={() => handlePressEntry(item)}>
            {item.type === 'Folder' ? <FolderCard item={item} /> : <PosterCard item={item} />}
          </Pressable>
        )}
        onEndReached={state.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          state.loading && state.page > 0 ? (
            <ActivityIndicator style={styles.footer} color={t.accent} />
          ) : null
        }
        contentContainerStyle={[styles.gridContent, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
      />
    );
  }

  return (
    <FlashList
      // 与网格模式区分实例（同见上方 key 注释）
      key="song-rows"
      data={visibleList}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => {
        if (item.type === 'Audio') {
          return <SongRow song={toAudioItem(item)} onPress={() => handlePressSong(toAudioItem(item))} />;
        }
        const isFolder = item.type === 'Folder';
        const rowIcon = isFolder ? '📁' : item.type === 'Playlist' ? '≡' : '♪';
        const rowSubtext = isFolder
          ? item.childCount !== undefined
            ? `${item.childCount} 项`
            : undefined
          : item.subtext;
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => handlePressEntry(item)}
          >
            <Text style={styles.rowIcon}>{rowIcon}</Text>
            <View style={styles.rowCenter}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              {rowSubtext !== undefined && <Text style={styles.rowSubtext}>{rowSubtext}</Text>}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      }}
      onEndReached={state.loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        state.loading && state.page > 0 ? (
          <ActivityIndicator style={styles.footer} color={t.accent} />
        ) : null
      }
      contentContainerStyle={[styles.content, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.m },
    content: { paddingHorizontal: SPACING.m },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingVertical: SPACING.s,
      paddingHorizontal: SPACING.m,
    },
    pressed: { opacity: 0.7 },
    rowIcon: { fontSize: FONT_SIZE.header, width: 32, textAlign: 'center' },
    rowCenter: { flex: 1, gap: 2 },
    rowName: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    rowSubtext: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    chevron: { color: t.textTertiary, fontSize: FONT_SIZE.title },
    footer: { paddingVertical: SPACING.l },
  });
