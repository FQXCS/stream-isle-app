/**
 * 艺人/作者列表 Tab：圆形头像行，点击进 AlbumDetail(artist)。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { AppError } from '@/infra/error';
import { ArtistList } from '@/page/library/components/ArtistList';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import type { RootStackParamList } from '@/page/navigation/types';
import { fetchMusicArtists } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { type ThemeTokens } from '@/constant/theme';

type ArtistNavigation = NativeStackNavigationProp<RootStackParamList>;

interface ArtistListTabProps {
  libraryId: string;
  sort: LibrarySortState;
  emptyTitle?: string;
}

export function ArtistListTab({ libraryId, sort, emptyTitle = '暂无艺人' }: ArtistListTabProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<ArtistNavigation>();
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchMusicArtists(libraryId, page, sort),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [libraryId, sort.sortBy, sort.sortOrder]
    )
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
    return <EmptyView title={emptyTitle} />;
  }
  return (
    <ArtistList
      items={state.itemList}
      onPressItem={(item) =>
        navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'artist', itemId: item.id })
      }
      onEndReached={state.loadMore}
      footer={state.loading && state.page > 0 ? <ActivityIndicator color={t.accent} /> : null}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
  });
