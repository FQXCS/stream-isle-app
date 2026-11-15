/**
 * 歌单 Tab（音乐个人歌单文档 §5.6.5）：专辑同款三列网格 + 头部「新建歌单」。
 * 数据源走全局歌单查询（fetchMusicPlaylistPage，**不带 ParentId**）——
 * POST /Playlists 创建的歌单是服务端全局条目，不挂在音乐库树下，ParentId 查询永远查不到；
 * 点击进 AlbumDetail(kind='playlist')；卡片复用 PosterCard（Playlist = 1:1 方形 + playlist 占位），
 * 副标题显示曲目数（对齐专辑卡的「艺人 · 年份」位）。
 */
import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { NewPlaylistDialog } from '@/component/NewPlaylistDialog';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { PosterCard } from '@/component/PosterCard';
import { showCenterToast, showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { GRID_COLUMNS } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError, errorMessageOf } from '@/infra/error';
import { useT } from '@/i18n';
import { fetchMusicPlaylistPage } from '@/service/BrowseService';
import { playlistService } from '@/service/PlaylistService';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import type { RootStackParamList } from '@/page/navigation/types';
import type { LibrarySortState } from '@/store/libraryViewStore';

type PlaylistNavigation = NativeStackNavigationProp<RootStackParamList>;

interface PlaylistGridTabProps {
  sort: LibrarySortState;
}

/** 操作失败 Toast（文案取错误码映射唯一出处） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

export function PlaylistGridTab({ sort }: PlaylistGridTabProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<PlaylistNavigation>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const [creating, setCreating] = useState(false);
  const state = usePagedLoad<MediaLibraryItem>(
    useCallback(
      (page) => fetchMusicPlaylistPage(page, sort),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [sort.sortBy, sort.sortOrder]
    )
  );

  /** 新建空歌单：成功居中提示 + 刷新本 Tab 列表（新歌单即出现在网格顶部区域） */
  const createPlaylist = async (name: string) => {
    try {
      await playlistService.createPlaylist(name);
      showCenterToast(tr('playlist.created', { name }));
      setCreating(false);
      void state.refresh();
    } catch (err) {
      toastError(err);
      throw err;
    }
  };

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
  return (
    <View style={styles.fill}>
      <FlashList
        data={state.itemList}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) => (
          <Pressable
            style={styles.gridCell}
            onPress={() => navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'playlist', itemId: item.id })}
          >
            <PosterCard
              item={item}
              subtextOverride={
                item.childCount !== undefined
                  ? tr('playlist.trackCount', { count: item.childCount })
                  : undefined
              }
            />
          </Pressable>
        )}
        onEndReached={state.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <Pressable style={styles.createButton} onPress={() => setCreating(true)}>
            <AppIcon name="playlistPlus" size={18} color={t.accent} />
            <Text style={styles.createText}>{tr('playlist.newPlaylist')}</Text>
          </Pressable>
        }
        ListEmptyComponent={<EmptyView title={tr('playlist.empty')} />}
        ListFooterComponent={
          state.loading && state.page > 0 ? (
            <ActivityIndicator style={styles.footer} color={t.accent} />
          ) : null
        }
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: SPACING.xl + miniPlayerPadding },
        ]}
      />
      {creating && (
        <NewPlaylistDialog
          visible
          title={tr('playlist.newPlaylist')}
          onConfirm={createPlaylist}
          onCancel={() => setCreating(false)}
        />
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bg },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    gridContent: { paddingHorizontal: SPACING.s, paddingBottom: SPACING.xl },
    gridCell: { flex: 1, paddingHorizontal: SPACING.xs, paddingBottom: SPACING.m },
    /** 头部「新建歌单」：虚位按钮居左，压在网格第一行上方 */
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.s,
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.s,
      marginHorizontal: SPACING.xs,
      marginTop: SPACING.s,
      marginBottom: SPACING.xs,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      backgroundColor: t.surface,
    },
    createText: { fontSize: FONT_SIZE.body, color: t.accent },
    footer: { paddingVertical: SPACING.l },
  });
