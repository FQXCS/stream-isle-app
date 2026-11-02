/**
 * 歌曲列表 Tab：全部歌曲/已看/未看（filters 由 TabSpec 提供），点歌从当前片段起播入队。
 */
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AudioItem, ItemFilterEnum } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf } from '@/infra/error';
import { SongFlashList } from '@/page/library/components/SongFlashList';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
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
  const styles = createStyles(t);
  const state = usePagedLoad<AudioItem>(
    useCallback(
      (page) => fetchAllSongs(libraryId, page, sort, filters),
      // 原始值依赖，避免对象引用抖动
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [libraryId, sort.sortBy, sort.sortOrder, filters]
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
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (state.itemList.length === 0) {
    return <EmptyView title="暂无歌曲" />;
  }
  return (
    <SongFlashList
      songList={state.itemList}
      onPressSong={handlePressSong}
      onEndReached={state.loadMore}
      footer={state.loading && state.page > 0 ? <ActivityIndicator color={t.accent} /> : null}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
  });
