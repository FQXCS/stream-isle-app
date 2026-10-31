/**
 * 音乐库四区布局（M5 文档 §4.12）：Library 路由按 MediaLibrary.type=MUSIC 的布局分支
 * （非独立路由）。顶部 ZoneChips（专辑/艺术家/歌单/全部歌曲），切换即换列表；
 * 各区 FlashList + 服务端分页。页面局部 state（设计文档 §9 浏览数据不持久化，05 §4.7）。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import type { AudioItem, MediaLibrary, MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { showToast } from '@/component/Toast';
import { ROUTES } from '@/constant/navigation';
import { type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf, type AppErrorCode } from '@/infra/error';
import { audioService } from '@/service/AudioService';
import {
  fetchAllSongs,
  fetchMusicAlbums,
  fetchMusicArtists,
  fetchMusicPlaylists,
} from '@/service/BrowseService';
import type { RootStackParamList } from '@/page/navigation/types';
import { AlbumGrid } from '@/page/library/components/AlbumGrid';
import { ArtistList } from '@/page/library/components/ArtistList';
import { SongFlashList } from '@/page/library/components/SongFlashList';
import { ZoneChips, type MusicZone } from '@/page/library/components/ZoneChips';

type WallNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 分页加载状态（页面局部，不进 browseStore——05 文档 §4.7「browseStore 无需变更」） */
interface PagedState<T> {
  itemList: T[];
  total: number;
  /** 已加载页码（0 起；-1 = 尚未加载） */
  page: number;
  loading: boolean;
  errorCode: AppErrorCode | null;
}

function initialPaged<T>(): PagedState<T> {
  return { itemList: [], total: 0, page: -1, loading: true, errorCode: null };
}

/** 通用分页加载 hook（切换区即重置；滚动到底自动追加；refresh 可等待供下拉刷新） */
function usePagedLoad<T>(
  loadPage: (page: number) => Promise<{ items: T[]; total: number }>
): PagedState<T> & {
  loadMore: () => void;
  refresh: () => Promise<void>;
  retry: () => void;
} {
  const [state, setState] = useState<PagedState<T>>(initialPaged);

  const fetchPage = useCallback(
    async (page: number) => {
      setState((prev) => ({ ...prev, loading: true, errorCode: null }));
      try {
        const result = await loadPage(page);
        setState((prev) => ({
          itemList: page === 0 ? result.items : [...prev.itemList, ...result.items],
          total: result.total,
          page,
          loading: false,
          errorCode: null,
        }));
      } catch (err) {
        const code = err instanceof AppError ? err.code : 'UNKNOWN';
        setState((prev) => ({ ...prev, loading: false, errorCode: code }));
      }
    },
    [loadPage]
  );

  // 聚焦加载（与 M2 详情页同口径：页面局部 state + useFocusEffect 聚焦刷新，05 §4.7）
  useFocusEffect(
    useCallback(() => {
      void fetchPage(0);
    }, [fetchPage])
  );

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (
        prev.loading ||
        prev.errorCode !== null ||
        prev.page < 0 ||
        prev.itemList.length >= prev.total
      ) {
        return prev;
      }
      void fetchPage(prev.page + 1);
      return { ...prev, loading: true };
    });
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    await fetchPage(0);
  }, [fetchPage]);

  const retry = useCallback(() => {
    void fetchPage(0);
  }, [fetchPage]);

  return { ...state, loadMore, refresh, retry };
}

export function MusicLibraryScreen({ library }: { library: MediaLibrary }) {
  const t = useTheme();
  const styles = createStyles(t);
  const [zone, setZone] = useState<MusicZone>('album');

  return (
    <View style={styles.fill}>
      <ZoneChips active={zone} onSelect={setZone} />
      {zone === 'album' && <AlbumZone libraryId={library.id} />}
      {zone === 'artist' && <ArtistZone libraryId={library.id} />}
      {zone === 'playlist' && <PlaylistZone />}
      {zone === 'song' && <SongZone libraryId={library.id} />}
    </View>
  );
}

/** 专辑区：封面网格（副标题「艺人 · 年份」由 adapter 翻译），点击进 AlbumDetail(album) */
function AlbumZone({ libraryId }: { libraryId: string }) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<WallNavigationProp>();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback((page) => fetchMusicAlbums(libraryId, page), [libraryId])
  );
  const [refreshing, setRefreshing] = useState(false);

  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return <LoadingSpinner />;
  }
  return (
    <AlbumGrid
      items={state.itemList}
      onPressItem={(item) =>
        navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'album', itemId: item.id })
      }
      onEndReached={state.loadMore}
      footer={state.loading && state.page > 0 ? <LoadingSpinner /> : null}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void state.refresh().finally(() => setRefreshing(false));
      }}
    />
  );
}

/** 艺术家区：圆形头像行列表，点击进 AlbumDetail(artist) */
function ArtistZone({ libraryId }: { libraryId: string }) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<WallNavigationProp>();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback((page) => fetchMusicArtists(libraryId, page), [libraryId])
  );

  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return <LoadingSpinner />;
  }
  return (
    <ArtistList
      items={state.itemList}
      onPressItem={(item) =>
        navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'artist', itemId: item.id })
      }
      onEndReached={state.loadMore}
      footer={state.loading && state.page > 0 ? <LoadingSpinner /> : null}
    />
  );
}

/** 歌单区：通用 Playlist 条目网格（服务端全局歌单），点击进 AlbumDetail(playlist) */
function PlaylistZone() {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<WallNavigationProp>();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback((page) => fetchMusicPlaylists(page), [])
  );

  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return <LoadingSpinner />;
  }
  if (state.itemList.length === 0) {
    return <EmptyView title="暂无歌单" />;
  }
  return (
    <AlbumGrid
      items={state.itemList}
      onPressItem={(item) =>
        navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'playlist', itemId: item.id })
      }
      onEndReached={state.loadMore}
      footer={state.loading && state.page > 0 ? <LoadingSpinner /> : null}
    />
  );
}

/**
 * 全部歌曲区：SongRow 列表；点单曲 = 当前已加载片段从被点曲起播入队
 * （服务端分页列表不预取全量，自然限界，避免万级队列，05 §4.12）。
 */
function SongZone({ libraryId }: { libraryId: string }) {
  const t = useTheme();
  const styles = createStyles(t);
  const state = usePagedLoad<AudioItem>(
    useCallback((page) => fetchAllSongs(libraryId, page), [libraryId])
  );

  const handlePressSong = useCallback(
    (song: AudioItem, index: number) => {
      void audioService.playQueue(state.itemList, index).catch(() => {
        showToast(errorMessageOf('UNKNOWN'), 'error');
      });
    },
    [state.itemList]
  );

  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return <LoadingSpinner />;
  }
  return (
    <SongFlashList
      songList={state.itemList}
      onPressSong={handlePressSong}
      onEndReached={state.loadMore}
      footer={state.loading && state.page > 0 ? <LoadingSpinner /> : null}
    />
  );
}

function LoadingSpinner() {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
});

/** 下拉刷新控件（列表组件 refreshControl 统一色调） */
export const MusicRefreshControl = RefreshControl;
