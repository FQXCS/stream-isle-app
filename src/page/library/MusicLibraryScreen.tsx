/**
 * 音乐库布局（M5 文档 §4.12 起，M7 调整）：Library 路由按 MediaLibrary.type=MUSIC 的分支。
 * 顶部视图段（分段控件，互斥单选）：全部（歌曲）/ 艺人 / 文件夹；文件夹区为目录逐级浏览
 * （Recursive=false，路径条可回上一级）。各区 FlashList + 服务端分页；
 * 页面局部 state（设计文档 §9 浏览数据不持久化，05 §4.7）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';

import type { AudioItem, MediaLibrary, MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { SegmentedControl } from '@/component/SegmentedControl';
import { showToast } from '@/component/Toast';
import { MUSIC_VIEW_OPTIONS, type MusicViewEnum } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf } from '@/infra/error';
import { audioService } from '@/service/AudioService';
import { fetchAllSongs, fetchMusicArtists } from '@/service/BrowseService';
import type { RootStackParamList } from '@/page/navigation/types';
import { ArtistList } from '@/page/library/components/ArtistList';
import { MusicFolderView } from '@/page/library/components/MusicFolderView';
import { SongFlashList } from '@/page/library/components/SongFlashList';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';

type MusicNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 文件夹浏览路径元素 */
export function MusicLibraryScreen({ library }: { library: MediaLibrary }) {
  const t = useTheme();
  const styles = createStyles(t);
  // 视图段：全部（歌曲）/ 艺人 / 文件夹
  const [view, setView] = useState<MusicViewEnum>('all');
  // 文件夹浏览路径（空=库根目录；元素为进入过的子目录 id）
  const [folderPath, setFolderPath] = useState<string[]>([]);

  const folderId = folderPath.length > 0 ? folderPath[folderPath.length - 1] : library.id;

  // 文件夹浏览中按系统返回键先回上一级（库根目录时交回导航栈退出库页）
  useEffect(() => {
    if (view !== 'folder' || folderPath.length === 0) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFolderPath((path) => path.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [view, folderPath.length]);

  return (
    <View style={styles.fill}>
      <SegmentedControl
        optionList={MUSIC_VIEW_OPTIONS}
        value={view}
        onChange={(next) => {
          // 切换视图回到库根目录
          setView(next);
          setFolderPath([]);
        }}
      />
      {view === 'all' && <SongZone libraryId={library.id} />}
      {view === 'artist' && <ArtistZone libraryId={library.id} />}
      {view === 'folder' && (
        <MusicFolderView
          folderId={folderId}
          onOpenFolder={(folder) => setFolderPath((path) => [...path, folder.id])}
        />
      )}
    </View>
  );
}

/** 艺人区：圆形头像行列表，点击进 AlbumDetail(artist) */
function ArtistZone({ libraryId }: { libraryId: string }) {
  const navigation = useNavigation<MusicNavigationProp>();
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

/**
 * 全部歌曲区：SongRow 列表；点单曲 = 当前已加载片段从被点曲起播入队
 * （服务端分页列表不预取全量，自然限界，避免万级队列，05 §4.12）。
 */
function SongZone({ libraryId }: { libraryId: string }) {
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
  if (state.itemList.length === 0) {
    return <EmptyView title="暂无歌曲" />;
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
