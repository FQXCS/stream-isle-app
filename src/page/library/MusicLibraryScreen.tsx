/**
 * 音乐库布局（M5 文档 §4.12 起，M7 调整）：Library 路由按 MediaLibrary.type=MUSIC 的分支。
 * 顶部视图段（分段控件，互斥单选）：全部（歌曲）/ 艺人 / 文件夹；文件夹区为目录逐级浏览
 * （Recursive=false，路径条可回上一级）。各区 FlashList + 服务端分页。
 * 排序入口在导航栏右上角 SortMenu：全部=音频 12 项（Emby 音乐词表），艺人/文件夹=各自有效子集；
 * 选择按「服务器 + 库」持久化（libraryViewStore）。
 * 页面局部 state（设计文档 §9 浏览数据不持久化，05 §4.7）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';

import type { AudioItem, MediaLibrary, MediaLibraryItem, SortByEnum } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { SegmentedControl } from '@/component/SegmentedControl';
import { SortMenu, SortMenuButton } from '@/component/SortMenu';
import { showToast } from '@/component/Toast';
import {
  ARTIST_SORT_OPTIONS,
  AUDIO_SORT_OPTIONS,
  FOLDER_SORT_OPTIONS,
  MUSIC_VIEW_OPTIONS,
  type MusicViewEnum,
} from '@/constant/browse';
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
import { useAccountStore } from '@/store/accountStore';
import {
  DEFAULT_LIBRARY_SORT,
  librarySortKeyOf,
  useLibraryViewStore,
} from '@/store/libraryViewStore';

type MusicNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 排序方向字面量（子区 props 与页面 state 同形） */
type SortOrder = 'ASC' | 'DESC';

export function MusicLibraryScreen({ library }: { library: MediaLibrary }) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<MusicNavigationProp>();
  const serverId = useAccountStore((state) => state.active?.serverId ?? '');
  // 排序持久化：每个库记住自己的排序（重进库页默认沿用）
  const sortKey = librarySortKeyOf(serverId, library.id);
  const savedSort = useLibraryViewStore((state) => state.sortByKey[sortKey]);
  // 视图段：全部（歌曲）/ 艺人 / 文件夹
  const [view, setView] = useState<MusicViewEnum>('all');
  // 文件夹浏览路径（空=库根目录；元素为进入过的子目录 id）
  const [folderPath, setFolderPath] = useState<string[]>([]);
  // 排序字段/方向（导航栏右上角 SortMenu；初值取该库上次保存的排序）
  const [sortBy, setSortBy] = useState<SortByEnum>(
    () => savedSort?.sortBy ?? DEFAULT_LIBRARY_SORT.sortBy
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => savedSort?.sortOrder ?? DEFAULT_LIBRARY_SORT.sortOrder
  );
  // 排序面板开合（页内浮层）
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const folderId = folderPath.length > 0 ? folderPath[folderPath.length - 1] : library.id;

  // 当前视图可用的排序项：歌曲=音频词表，艺人/文件夹=实测有效子集
  const sortOptionList = useMemo(() => {
    if (view === 'all') {
      return AUDIO_SORT_OPTIONS;
    }
    return view === 'artist' ? ARTIST_SORT_OPTIONS : FOLDER_SORT_OPTIONS;
  }, [view]);

  // 当前字段不在可用集合（如歌曲的专辑排序切到艺人/文件夹）时按默认标题升序，
  // 切回支持该字段的视图自动恢复；不写 state，避免视图切换产生连锁渲染
  const sortSupported = sortOptionList.some((option) => option.value === sortBy);
  const activeSortBy = sortSupported ? sortBy : DEFAULT_LIBRARY_SORT.sortBy;
  const activeSortOrder = sortSupported ? sortOrder : DEFAULT_LIBRARY_SORT.sortOrder;

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

  /**
   * 排序切换（关闭面板）：选同一字段 = 切换升降序（随机无方向不切换），
   * 选其他字段 = 用其默认方向；结果写入 libraryViewStore 持久化。
   */
  const handleSelectSort = useCallback(
    (next: SortByEnum) => {
      setSortMenuOpen(false);
      const option = sortOptionList.find((item) => item.value === next);
      let nextOrder: SortOrder;
      if (next === activeSortBy) {
        if (option?.defaultOrder === null) {
          return;
        }
        nextOrder = activeSortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        nextOrder = option?.defaultOrder ?? 'ASC';
      }
      setSortBy(next);
      setSortOrder(nextOrder);
      useLibraryViewStore.getState().actions.setLibrarySort(sortKey, {
        sortBy: next,
        sortOrder: nextOrder,
      });
    },
    [activeSortBy, activeSortOrder, sortKey, sortOptionList]
  );

  const handleToggleSortMenu = useCallback(() => setSortMenuOpen((open) => !open), []);
  const handleCloseSortMenu = useCallback(() => setSortMenuOpen(false), []);

  // 排序入口注入导航栏右上角（库名居中标题在 RootNavigator 的 LIBRARY options 中）
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <SortMenuButton onPress={handleToggleSortMenu} />,
    });
  }, [navigation, handleToggleSortMenu]);

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
      {view === 'all' && (
        <SongZone libraryId={library.id} sortBy={activeSortBy} sortOrder={activeSortOrder} />
      )}
      {view === 'artist' && (
        <ArtistZone libraryId={library.id} sortBy={activeSortBy} sortOrder={activeSortOrder} />
      )}
      {view === 'folder' && (
        <MusicFolderView
          folderId={folderId}
          sortBy={activeSortBy}
          sortOrder={activeSortOrder}
          onOpenFolder={(folder) => setFolderPath((path) => [...path, folder.id])}
        />
      )}
      {sortMenuOpen && (
        <SortMenu
          sortBy={activeSortBy}
          sortOrder={activeSortOrder}
          optionList={sortOptionList}
          onSelect={handleSelectSort}
          onClose={handleCloseSortMenu}
        />
      )}
    </View>
  );
}

/** 艺人区：圆形头像行列表，点击进 AlbumDetail(artist) */
function ArtistZone({
  libraryId,
  sortBy,
  sortOrder,
}: {
  libraryId: string;
  sortBy: SortByEnum;
  sortOrder: SortOrder;
}) {
  const navigation = useNavigation<MusicNavigationProp>();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchMusicArtists(libraryId, page, { sortBy, sortOrder }),
      [libraryId, sortBy, sortOrder]
    )
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
function SongZone({
  libraryId,
  sortBy,
  sortOrder,
}: {
  libraryId: string;
  sortBy: SortByEnum;
  sortOrder: SortOrder;
}) {
  const state = usePagedLoad<AudioItem>(
    useCallback(
      (page) => fetchAllSongs(libraryId, page, { sortBy, sortOrder }),
      [libraryId, sortBy, sortOrder]
    )
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
