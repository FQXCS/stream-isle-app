/**
 * 专辑/歌单/艺术家详情三态页（M5 文档 §4.12，kind 路由参数区分；设计文档 §10.2 AlbumDetail）。
 * - album：封面 + 「艺人 · 年份 · N 首 · 总时长」+ 三按钮 + 曲目列表；
 * - playlist：同布局、按服务端顺序（无艺人行）；
 * - artist：与专辑同款头部（封面 + 名称 + 统计）+ 三按钮（热门歌曲）+ 简介 + 专辑网格 + 热门歌曲。
 * 三按钮语义（设计文档 §7.5 / 05 §4.12 入队语义表）：
 * 播放全部 = 整单入队从第 1 首起播；随机播放 = 整单打乱入队从随机第 1 首起播；加入队列 = 追加队尾。
 */
import { useCallback, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AlbumDetailModel, ArtistDetailModel, AudioItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { SongRow } from '@/component/SongRow';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { HOT_SONGS_LIMIT } from '@/constant/audio';
import { ROUTES } from '@/constant/navigation';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import { AppError, type AppErrorCode } from '@/infra/error';
import { audioService } from '@/service/AudioService';
import { detailService } from '@/service/DetailService';
import { usePlayerStore } from '@/store/playerStore';
import { formatClock } from '@/util/format';
import type { RootStackParamList } from '@/page/navigation/types';

type DetailNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface AlbumDetailParams {
  kind: 'album' | 'artist' | 'playlist';
  itemId: string;
}

export function AlbumDetailScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const route = useRoute<{ key: string; name: string; params: AlbumDetailParams }>();
  const { kind, itemId } = route.params;

  return (
    <View style={styles.fill}>
      {kind === 'artist' ? (
        <ArtistDetailBody artistId={itemId} />
      ) : (
        <AlbumPlaylistBody kind={kind} itemId={itemId} />
      )}
    </View>
  );
}

/** 整单三按钮（album/playlist/artist 共用） */
function ActionRow({
  trackList,
}: {
  trackList: AudioItem[];
}) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const handlePlayAll = useCallback(() => {
    void audioService.playQueue(trackList, 0).catch(() => undefined);
  }, [trackList]);

  const handlePlayShuffled = useCallback(() => {
    // 整单打乱入队，从随机第 1 首起播（repeatMode 不变，05 §4.12）
    const shuffled = [...trackList];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    void audioService.playQueue(shuffled, 0).catch(() => undefined);
  }, [trackList]);

  const handleAddToQueue = useCallback(() => {
    void audioService.addToQueue(trackList).catch(() => undefined);
  }, [trackList]);

  return (
    <View style={styles.actionRow}>
      <Pressable style={styles.primaryButton} onPress={handlePlayAll}>
        <AppIcon name="play" size={16} color="#FFFFFF" />
        <Text style={styles.primaryButtonText}>{tr('album.playAll')}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={handlePlayShuffled}>
        <Text style={styles.secondaryButtonText}>{tr('album.shuffle')}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={handleAddToQueue}>
        <Text style={styles.secondaryButtonText}>{tr('album.addToQueue')}</Text>
      </Pressable>
    </View>
  );
}

/** 专辑/歌单态主体 */
function AlbumPlaylistBody({ kind, itemId }: { kind: 'album' | 'playlist'; itemId: string }) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<DetailNavigationProp>();
  const [detail, setDetail] = useState<AlbumDetailModel | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const currentTrackId = usePlayerStore((state) => state.audio.currentTrack?.id ?? null);
  // 迷你条让位（05 §4.10）：音频活跃时曲目列表底部 padding 叠加迷你条高度
  const miniPlayerPadding = useMiniPlayerPadding();

  // 聚焦加载（与 M2 详情页同口径；加载函数内 setState 位于异步续体）
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load =
        kind === 'album' ? detailService.loadAlbum(itemId) : detailService.loadPlaylist(itemId);
      load
        .then((model) => {
          if (!cancelled) {
            setDetail(model);
            // 系统导航栏标题跟随条目名称（路由默认标题只是「专辑/播放列表」）
            navigation.setOptions({ title: model.name });
            setErrorCode(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setErrorCode(err instanceof AppError ? err.code : 'UNKNOWN');
          }
        });
      return () => {
        cancelled = true;
      };
    }, [kind, itemId, navigation])
  );

  const totalDurationMs = useMemo(
    () => (detail?.trackList ?? []).reduce((sum, track) => sum + (track.runtimeMs ?? 0), 0),
    [detail]
  );

  const handlePressSong = useCallback((song: AudioItem) => {
    // 点单曲仅该曲入队（整单播放走上方「播放全部」）
    void audioService.playQueue([song], 0).catch(() => undefined);
  }, []);

  if (errorCode !== null) {
    return <ErrorView error={new AppError(errorCode)} />;
  }
  if (detail === null) {
    return <LoadingView />;
  }
  if (detail.trackList.length === 0) {
    return <EmptyView title={tr('album.emptyTracks')} />;
  }

  const metaLine =
    kind === 'album'
      ? [detail.artistName, detail.productionYear !== undefined ? String(detail.productionYear) : undefined]
          .filter((part) => part !== undefined)
          .join(' · ') || undefined
      : undefined;

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
    >
      <View style={styles.header}>
        {detail.coverImageUrl !== undefined ? (
          <Image source={{ uri: detail.coverImageUrl }} style={styles.cover} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <AppIcon name="audio" size={32} color={t.textSecondary} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>{detail.name}</Text>
          {metaLine !== undefined && <Text style={styles.meta}>{metaLine}</Text>}
          <Text style={styles.meta}>
            {tr('album.trackSummary', {
              count: detail.trackList.length,
              duration: formatClock(totalDurationMs),
            })}
          </Text>
        </View>
      </View>
      <ActionRow trackList={detail.trackList} />
      {detail.trackList.map((track, index) => (
        <SongRow
          key={track.id}
          song={track}
          indexNumber={track.indexNumber ?? index + 1}
          showDivider={index < detail.trackList.length - 1}
          active={track.id === currentTrackId}
          onPress={() => handlePressSong(track)}
        />
      ))}
    </ScrollView>
  );
}

/** 艺术家态主体：与专辑详情同款头部 + 三按钮（热门歌曲）+ 简介 + 专辑网格 + 热门歌曲 */
function ArtistDetailBody({ artistId }: { artistId: string }) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<DetailNavigationProp>();
  const [detail, setDetail] = useState<ArtistDetailModel | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const currentTrackId = usePlayerStore((state) => state.audio.currentTrack?.id ?? null);
  // 迷你条让位（同上）
  const miniPlayerPadding = useMiniPlayerPadding();

  // 聚焦加载（同上）
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      detailService
        .loadArtist(artistId)
        .then((model) => {
          if (!cancelled) {
            setDetail(model);
            // 系统导航栏标题跟随艺人名称（路由默认标题只是「艺人」）
            navigation.setOptions({ title: model.name });
            setErrorCode(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setErrorCode(err instanceof AppError ? err.code : 'UNKNOWN');
          }
        });
      return () => {
        cancelled = true;
      };
    }, [artistId, navigation])
  );

  const handlePressSong = useCallback((song: AudioItem) => {
    // 点单曲仅该曲入队，不把热门歌曲整列带入队列
    void audioService.playQueue([song], 0).catch(() => undefined);
  }, []);

  if (errorCode !== null) {
    return <ErrorView error={new AppError(errorCode)} />;
  }
  if (detail === null) {
    return <LoadingView />;
  }

  const metaLine =
    [
      detail.albumList.length > 0
        ? tr('album.albumCount', { count: detail.albumList.length })
        : undefined,
      detail.hotSongList.length > 0
        ? tr('album.hotSongCount', {
            count: Math.min(detail.hotSongList.length, HOT_SONGS_LIMIT),
          })
        : undefined,
    ]
      .filter((part) => part !== undefined)
      .join(' · ') || undefined;

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING.xl + miniPlayerPadding }]}
    >
      <View style={styles.header}>
        {detail.avatarImageUrl !== undefined ? (
          <Image
            source={{ uri: detail.avatarImageUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <AppIcon name="audio" size={32} color={t.textSecondary} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>{detail.name}</Text>
          {metaLine !== undefined && <Text style={styles.meta}>{metaLine}</Text>}
        </View>
      </View>
      {detail.hotSongList.length > 0 && <ActionRow trackList={detail.hotSongList} />}
      {detail.overview !== undefined && detail.overview !== '' && (
        <Pressable onPress={() => setOverviewExpanded((value) => !value)}>
          <Text style={styles.overview} numberOfLines={overviewExpanded ? undefined : 3}>
            {detail.overview}
          </Text>
        </Pressable>
      )}
      {detail.albumList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{tr('album.sectionAlbums')}</Text>
          <View style={styles.albumRow}>
            {detail.albumList.map((album) => (
              <Pressable
                key={album.id}
                style={styles.albumCell}
                onPress={() => navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'album', itemId: album.id })}
              >
                {album.posterImageUrl !== undefined ? (
                  <Image
                    source={{ uri: album.posterImageUrl }}
                    style={styles.albumCover}
                    contentFit="cover"
                    transition={150}
                    recyclingKey={album.id}
                  />
                ) : (
                  <View style={[styles.albumCover, styles.coverFallback]}>
                    <AppIcon name="audio" size={32} color={t.textSecondary} />
                  </View>
                )}
                <Text style={styles.albumName} numberOfLines={1}>
                  {album.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {detail.hotSongList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            {tr('album.hotSongsTitle', {
              count: Math.min(detail.hotSongList.length, HOT_SONGS_LIMIT),
            })}
          </Text>
          {detail.hotSongList.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              indexNumber={index + 1}
              showDivider={index < detail.hotSongList.length - 1}
              active={song.id === currentTrackId}
              onPress={() => handlePressSong(song)}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  content: { paddingBottom: SPACING.xl },
  header: { flexDirection: 'row', gap: SPACING.m, padding: SPACING.m },
  headerText: { flex: 1, gap: SPACING.xs, justifyContent: 'center' },
  cover: {
    width: 120,
    height: 120,
    borderRadius: POSTER_RADIUS,
    backgroundColor: t.surface,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { color: t.textPrimary, fontSize: FONT_SIZE.header, fontWeight: '600' },
  meta: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: t.accent,
    borderRadius: POSTER_RADIUS,
    paddingVertical: SPACING.s,
  },
  primaryButtonText: { color: t.accentOn, fontSize: FONT_SIZE.body, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.separator,
    borderRadius: POSTER_RADIUS,
    paddingVertical: SPACING.s,
  },
  secondaryButtonText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  overview: { color: t.textSecondary, fontSize: FONT_SIZE.body, paddingHorizontal: SPACING.m },
  sectionTitle: {
    color: t.textPrimary,
    fontSize: FONT_SIZE.title,
    fontWeight: '600',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  albumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m, paddingHorizontal: SPACING.m },
  albumCell: { width: 100, gap: SPACING.xs },
  albumCover: {
    width: 100,
    height: 100,
    borderRadius: POSTER_RADIUS,
    backgroundColor: t.surface,
  },
  albumName: { color: t.textPrimary, fontSize: FONT_SIZE.body },
});
