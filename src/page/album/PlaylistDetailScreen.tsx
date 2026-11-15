/**
 * 通用歌单详情（视频/混合歌单）：音频歌单走歌曲行播放队列，其他类型走海报墙。
 * 音频歌单也可从音乐库直接进 AlbumDetail(playlist)；本页用于非音乐库的播放列表 Tab。
 */
import { useCallback, useMemo } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AudioItem, MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS } from '@/constant/browse';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import {
  useMultiSelectAddToPlaylist,
  useSongMultiSelect,
} from '@/page/library/components/useSongMultiSelect';
import { SongFlashList } from '@/page/library/components/SongFlashList';
import { navigateMediaItem } from '@/page/library/tabs/navigation';
import type { RootStackParamList } from '@/page/navigation/types';
import { audioService } from '@/service/AudioService';
import { loadPlaylistEntries } from '@/service/LibraryBrowseService';

type PlaylistNavigation = NativeStackNavigationProp<RootStackParamList>;

export function PlaylistDetailScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<PlaylistNavigation>();
  const route = useRoute<{ key: string; name: string; params: { playlistId: string } }>();
  const playlistId = route.params.playlistId;
  const miniPlayerPadding = useMiniPlayerPadding();

  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      async (page: number) => {
        if (page > 0) {
          return { items: [], total: 0 };
        }
        const items = await loadPlaylistEntries(playlistId);
        return { items, total: items.length };
      },
      [playlistId]
    )
  );

  const audioList = useMemo<AudioItem[]>(
    () =>
      state.itemList
        .filter((item) => item.type === 'Audio')
        .map((item) => ({
          id: item.id,
          name: item.name,
          runtimeMs: item.runtimeMs,
          coverImageUrl: item.posterImageUrl,
          favorite: item.userData.favorite,
        })),
    [state.itemList]
  );
  const allAudio = state.itemList.length > 0 && audioList.length === state.itemList.length;

  // 音频歌单多选批量加入歌单（音乐个人歌单二改）
  const multiSelect = useSongMultiSelect();
  const multiAdd = useMultiSelectAddToPlaylist(multiSelect, () => audioList.map((song) => song.id));

  const handlePressSong = useCallback(
    (song: AudioItem) => {
      if (multiSelect.selecting) {
        multiAdd.toggle(song.id);
        return;
      }
      // 点单曲仅该曲入队，不把整个歌单带入队列
      void audioService.playQueue([song], 0).catch(() => undefined);
    },
    [multiSelect.selecting, multiAdd]
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
  if (state.itemList.length === 0) {
    return <EmptyView title={tr('playlist.empty')} />;
  }
  if (allAudio) {
    return (
      <View style={styles.fill}>
        <SongFlashList
          songList={audioList}
          onPressSong={handlePressSong}
          onLongPressSong={(song) => multiAdd.enter(song.id)}
          selecting={multiSelect.selecting}
          isSongSelected={(song) => multiAdd.isSelected(song.id)}
        />
        {multiAdd.block}
      </View>
    );
  }
  return (
    <FlashList
      data={state.itemList}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => (
        <Pressable style={styles.gridCell} onPress={() => navigateMediaItem(navigation, item)}>
          <PosterCard item={item} />
        </Pressable>
      )}
      contentContainerStyle={[
        styles.gridContent,
        { paddingBottom: SPACING.xl + miniPlayerPadding },
      ]}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bg },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.s, paddingBottom: SPACING.xl },
    gridCell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
  });
