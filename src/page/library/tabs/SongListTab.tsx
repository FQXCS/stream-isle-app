/**
 * 歌曲列表 Tab：全部歌曲/已看/未看（filters 由 TabSpec 提供），点单曲仅该曲入队播放。
 * 多选批量加入歌单（音乐个人歌单二改）：长按进入多选态，点行切换选中，
 * 底部操作栏「加入歌单」批量提交。
 */
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AudioItem, ItemFilterEnum } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf } from '@/infra/error';
import { useT } from '@/i18n';
import { SongFlashList } from '@/page/library/components/SongFlashList';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import { useMultiSelectAddToPlaylist, useSongMultiSelect } from '@/page/library/components/useSongMultiSelect';
import { audioService } from '@/service/AudioService';
import { fetchAllSongs } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { type ThemeTokens } from '@/constant/theme';

interface SongListTabProps {
  libraryId: string;
  sort: LibrarySortState;
  filters?: readonly ItemFilterEnum[];
}

export function SongListTab({ libraryId, sort, filters }: SongListTabProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const state = usePagedLoad<AudioItem>(
    useCallback(
      (page) => fetchAllSongs(libraryId, page, sort, filters),
      // 原始值依赖，避免对象引用抖动
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [libraryId, sort.sortBy, sort.sortOrder, filters]
    )
  );
  const multiSelect = useSongMultiSelect();
  const multiAdd = useMultiSelectAddToPlaylist(multiSelect, () =>
    state.itemList.map((song) => song.id)
  );

  const handlePressSong = useCallback(
    (song: AudioItem) => {
      if (multiSelect.selecting) {
        multiAdd.toggle(song.id);
        return;
      }
      // 点单曲仅该曲入队，不自动把整个列表带入队列
      void audioService.playQueue([song], 0).catch(() => {
        showToast(errorMessageOf('UNKNOWN'), 'error');
      });
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
    return <EmptyView title={tr('library.emptySongs')} />;
  }
  return (
    <View style={styles.fill}>
      <SongFlashList
        songList={state.itemList}
        onPressSong={handlePressSong}
        onLongPressSong={(song) => multiAdd.enter(song.id)}
        selecting={multiSelect.selecting}
        isSongSelected={(song) => multiAdd.isSelected(song.id)}
        onEndReached={state.loadMore}
        footer={state.loading && state.page > 0 ? <ActivityIndicator color={t.accent} /> : null}
      />
      {multiAdd.block}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bg },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
  });
