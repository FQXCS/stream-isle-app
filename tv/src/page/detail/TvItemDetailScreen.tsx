/**
 * TV 详情页（TV-m2 §4.3/§4.4）：Hero（背景大图 + 海报 + 标题元数据）→ 主操作行
 * （播放/继续 TvPressable 首屏焦点 + 收藏 + 已看）→ 简介 → 季集区（Series）→ 演员行 →
 * 相似行。数据流与竞态守卫照搬手机 ItemDetailScreen：loadDetail → Series 追加
 * loadSeasons/loadEpisodes（selectedSeasonIdRef 守卫快速切季，风险 #3 不新发明）、
 * loadSimilar 失败静默、收藏/已看乐观更新失败回滚 + Toast。
 * 播放按钮：resolve → navigate(Player)（TV-m3 收口 TV-m2-S2 冒烟切片），会话携带
 * name/itemType/seriesId 供控制层标题与自动连播判定。
 * TV 无下载引擎/图书阅读器（TV 设计 §1.2），对应手机分支不移植。
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  EpisodeItem,
  MediaDetail,
  MediaItemTypeEnum,
  MediaLibraryItem,
  SeasonItem,
} from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { useT } from '@/i18n';
import { AppError, errorMessageOf } from '@/infra/error';
import { ROUTES } from '@/constant/navigation';
import { formatClock, formatRuntime } from '@/util/format';
import { formatBytes } from '@/util/formatBytes';
import { getResumePositionMs, toResumeSource } from '@/util/resume';
import { detailService } from '@/service/DetailService';
import { markService } from '@/service/MarkService';
import { playbackService } from '@/service/PlaybackService';

import { TvErrorView, TvLoadingSkeleton } from '@tv/component/TvStateViews';
import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { TvCastRow } from '@tv/page/detail/TvCastRow';
import { TvEpisodeRow } from '@tv/page/detail/TvEpisodeRow';
import { TvSeasonPicker } from '@tv/page/detail/TvSeasonPicker';
import { TvSimilarRow } from '@tv/page/detail/TvSimilarRow';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

/** toast 错误提示（文案一律取 ERROR_MESSAGE_MAP 唯一出处，手机同口径） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

/** 单文件可播类型（手机 isMediaFlowType 同口径；Season/Series 走各自的按钮分支） */
function isPlayableType(type: MediaItemTypeEnum): boolean {
  return (
    type === 'Movie' ||
    type === 'Episode' ||
    type === 'Video' ||
    type === 'Trailer' ||
    type === 'MusicVideo'
  );
}

/**
 * 详情元数据行（手机 metaTextOf 精简版）：单文件条目取「时长 · 大小 · 720p HEVC」，
 * 缺失回退「年份 · 分级 · 时长 · 类型」。TV-m2 不做图书大小惰性探测（无下载引擎）。
 */
function metaTextOf(detail: MediaDetail): string {
  const parts: string[] = [];
  if (detail.productionYear !== undefined) {
    parts.push(String(detail.productionYear));
  }
  if (detail.officialRating !== undefined) {
    parts.push(detail.officialRating);
  }
  if (detail.runtimeMs !== undefined && detail.runtimeMs > 0) {
    parts.push(formatRuntime(detail.runtimeMs));
  }
  const sizeBytes = detail.mediaSourceList[0]?.sizeBytes;
  if (sizeBytes !== undefined) {
    parts.push(formatBytes(sizeBytes));
  }
  if (detail.genreList.length > 0) {
    parts.push(detail.genreList.slice(0, 3).join(' '));
  }
  return parts.join(' · ');
}

export function TvItemDetailScreen() {
  const route = useRoute<{ key: string; name: string; params: { itemId: string } }>();
  const itemId = route.params.itemId;
  const navigation = useNavigation<TvNavigation>();
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles(t);

  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [similarList, setSimilarList] = useState<MediaLibraryItem[]>([]);
  const [seasons, setSeasons] = useState<SeasonItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  // 选中季镜像（loadDetail 聚焦刷新读取用；不进依赖避免季切换整页重拉，手机同口径）
  const selectedSeasonIdRef = useRef<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  /** 收藏乐观更新在途（防连点，手机同口径） */
  const [markingFavorite, setMarkingFavorite] = useState(false);
  const [markingPlayed, setMarkingPlayed] = useState(false);
  /**
   * 季选择器实例 tag（显式焦点引导，TV-m2 走查实测）：详情页纵向 ScrollView 内
   * arrowScroll 对「操作行 → 季选择器」的 DOWN 焦点搜索被滚动逻辑消费不落焦
   * （beam 的 x 偏移惩罚 + 滚动优先），实测定案用 m1 跳板同款 nextFocus* 子树寻址显式引导。
   */
  const [seasonPickerTag, setSeasonPickerTag] = useState<number | null>(null);

  // —— 单季集列表（显式参数触发；快速切季竞态守卫照搬手机：以 selectedSeasonIdRef 为准）——
  const seriesId = detail?.type === 'Series' ? detail.id : undefined;
  const loadEpisodes = useCallback(
    async (targetSeriesId: string, targetSeasonId: string | null) => {
      if (targetSeasonId === null) {
        return;
      }
      try {
        const list = await detailService.loadEpisodes(targetSeriesId, targetSeasonId);
        if (selectedSeasonIdRef.current !== targetSeasonId) {
          return;
        }
        setEpisodes(list);
        setEpisodesLoading(false);
      } catch {
        // 集列表失败就地静默保留旧列表（详情主体已可用；过期请求同样不消费）
        if (selectedSeasonIdRef.current !== targetSeasonId) {
          return;
        }
        setEpisodes([]);
        setEpisodesLoading(false);
      }
    },
    []
  );

  // —— 主数据加载（聚焦即刷新；已有数据时不重置整页 loading，保持滚动位置）——
  const loadDetail = useCallback(async () => {
    try {
      const loaded = await detailService.loadDetail(itemId);
      setDetail(loaded);
      setError(null);
      if (loaded.type === 'Series') {
        const seasonList = await detailService.loadSeasons(loaded.id);
        setSeasons(seasonList);
        // 默认选中第一项（adapter 已按季号升序）；已有选中（返回刷新）保持用户所选季
        const targetSeasonId = selectedSeasonIdRef.current ?? seasonList[0]?.id ?? null;
        selectedSeasonIdRef.current = targetSeasonId;
        setSelectedSeasonId(targetSeasonId);
        await loadEpisodes(loaded.id, targetSeasonId);
      }
      // 相似行失败不整页报错（主体数据已可用）
      try {
        setSimilarList(await detailService.loadSimilar(loaded.id));
      } catch {
        setSimilarList([]);
      }
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
    }
  }, [itemId, loadEpisodes]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail])
  );

  // —— 播放按钮：resolve → navigate(Player)（TV-m3 收口 TV-m2-S2 冒烟切片）——
  // 会话携带 name/itemType/seriesId（控制层标题 + 自动连播判定，手机 resolveAndPlay 同口径）
  const beginPlay = useCallback(
    (target: {
      id: string;
      name: string;
      type: MediaItemTypeEnum;
      seriesId?: string;
      source: { playbackPositionMs: number; runtimeMs?: number };
    }) => {
      const resumeMs = getResumePositionMs(target.source);
      void (async () => {
        try {
          const session = await playbackService.resolve(target.id, {
            startPositionMs: resumeMs ?? 0,
          });
          navigation.navigate(ROUTES.PLAYER, {
            session: {
              ...session,
              name: target.name,
              itemType: target.type,
              seriesId: target.seriesId,
            },
          });
        } catch (err) {
          toastError(err);
        }
      })();
    },
    [navigation]
  );

  // —— 已看标记：显式目标态，成功后刷新 UserData（图标态/集列表勾随之变化）——
  const updatePlayedState = useCallback(
    async (played: boolean) => {
      if (detail === null || markingPlayed) {
        return;
      }
      setMarkingPlayed(true);
      try {
        await markService.setPlayed(detail.id, played);
        const refreshed = await detailService.loadDetail(detail.id);
        setDetail(refreshed);
        if (refreshed.type === 'Series' && seriesId !== undefined) {
          await loadEpisodes(seriesId, selectedSeasonIdRef.current);
        }
      } catch (err) {
        toastError(err);
      } finally {
        setMarkingPlayed(false);
      }
    },
    [detail, markingPlayed, loadEpisodes, seriesId]
  );

  // —— 收藏 toggle：乐观更新——立即翻转 UI → await → 失败回滚 + Toast（手机同口径）——
  const toggleFavorite = useCallback(async () => {
    if (detail === null || markingFavorite) {
      return;
    }
    const nextFavorite = !detail.userData.favorite;
    const previous = detail.userData.favorite;
    setMarkingFavorite(true);
    setDetail({ ...detail, userData: { ...detail.userData, favorite: nextFavorite } });
    try {
      await markService.setFavorite(detail.id, nextFavorite);
    } catch (err) {
      setDetail({ ...detail, userData: { ...detail.userData, favorite: previous } });
      toastError(err);
    } finally {
      setMarkingFavorite(false);
    }
  }, [detail, markingFavorite]);

  if (detail === null) {
    if (error !== null) {
      return (
        <TvScreenFrame>
          <TvErrorView error={error} onRetry={() => void loadDetail()} />
        </TvScreenFrame>
      );
    }
    return (
      <TvScreenFrame>
        <TvLoadingSkeleton />
      </TvScreenFrame>
    );
  }

  const isSeries = detail.type === 'Series';
  const playable = isPlayableType(detail.type);
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;
  const selectedSeasonNumber = selectedSeason?.indexNumber ?? 0;
  // 续播语义（TV-m2 §4.3）：>10s 且 <95% →「继续 xx:xx」；其余「播放」
  const resumeMs = getResumePositionMs(toResumeSource(detail));
  // Series 无媒体流（resolve 必 PLAYBACK_UNSUPPORTED），主按钮改「播放第一集」：
  // 当前选中季优先第一个未看集，无集（未加载完/空季）时不渲染主按钮（手机同口径）
  const firstPlayableEpisode = isSeries
    ? (episodes.find((episode) => !episode.userData.played) ?? episodes[0] ?? null)
    : null;
  const metaText = metaTextOf(detail);

  const playLabel =
    resumeMs !== null
      ? tr('item.continueFrom', { time: formatClock(resumeMs) })
      : tr('action.play');

  return (
    <TvScreenFrame>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero：背景大图 + 海报 + 标题元数据（TV 版横排布局，TV 设计 §6.2 焦点落主操作） */}
        <View style={styles.hero}>
          {detail.heroImageUrl !== undefined ? (
            <Image source={{ uri: detail.heroImageUrl }} style={styles.heroImage} contentFit="cover" transition={200} />
          ) : null}
          <View style={styles.heroOverlay} pointerEvents="none" />
          <View style={styles.heroContent}>
            {detail.posterImageUrl !== undefined ? (
              <Image
                source={{ uri: detail.posterImageUrl }}
                style={styles.heroPoster}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.heroPoster, styles.heroPosterFallback]} />
            )}
            <View style={styles.heroInfo}>
              <Text style={[styles.title, { color: '#FFFFFF' }]} numberOfLines={2}>
                {detail.name}
              </Text>
              {metaText !== '' && (
                <Text style={styles.meta} numberOfLines={2}>
                  {metaText}
                </Text>
              )}
              {detail.communityRating !== undefined && (
                <View style={styles.ratingRow}>
                  <AppIcon name="star" size={14} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.meta}>{detail.communityRating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 主操作行（TV 设计 §7.2 首屏默认焦点落主操作）：播放/继续 + 收藏 + 已看。
            CTA 用 card 焦点态（TV-m1-S4 定案：row 的 accentSoft 焦点底会毁 accent 底对比） */}
        <View style={styles.actionRow}>
          {playable && (
            <TvPressable
              focusKind="card"
              hasTVPreferredFocus
              accessibilityRole="button"
              accessibilityLabel={playLabel}
              onPress={() =>
                beginPlay({
                  id: detail.id,
                  name: detail.name,
                  type: detail.type,
                  seriesId: detail.seriesId,
                  source: toResumeSource(detail),
                })
              }
              style={[styles.playButton, { backgroundColor: t.accent }]}
            >
              <AppIcon name="play" size={22} color={t.accentOn} />
              <Text style={[styles.playButtonText, { color: t.accentOn }]}>{playLabel}</Text>
            </TvPressable>
          )}
          {isSeries && firstPlayableEpisode !== null && (
            <TvPressable
              focusKind="card"
              hasTVPreferredFocus
              accessibilityRole="button"
              accessibilityLabel={tr('item.playFirstEpisode')}
              onPress={() =>
                beginPlay({
                  id: firstPlayableEpisode.id,
                  name: `${detail.name} · S${selectedSeasonNumber}E${firstPlayableEpisode.indexNumber} ${firstPlayableEpisode.name}`,
                  type: firstPlayableEpisode.type,
                  seriesId: firstPlayableEpisode.seriesId,
                  source: toResumeSource(firstPlayableEpisode),
                })
              }
              style={[styles.playButton, { backgroundColor: t.accent }]}
            >
              <AppIcon name="play" size={22} color={t.accentOn} />
              <Text style={[styles.playButtonText, { color: t.accentOn }]}>
                {tr('item.playFirstEpisode')}
              </Text>
            </TvPressable>
          )}
          <TvPressable
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={
              detail.userData.favorite ? tr('action.unfavorite') : tr('action.favorite')
            }
            onPress={() => void toggleFavorite()}
            style={[styles.iconButton, { backgroundColor: t.surface, borderColor: t.separator }]}
            nextFocusDown={isSeries ? (seasonPickerTag ?? undefined) : undefined}
          >
            <AppIcon
              name={detail.userData.favorite ? 'heart' : 'heartOutline'}
              size={26}
              color={detail.userData.favorite ? t.accent : t.textSecondary}
            />
          </TvPressable>
          <TvPressable
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={
              detail.userData.played ? tr('item.markUnplayed') : tr('item.markPlayed')
            }
            onPress={() => void updatePlayedState(!detail.userData.played)}
            style={[styles.iconButton, { backgroundColor: t.surface, borderColor: t.separator }]}
            nextFocusDown={isSeries ? (seasonPickerTag ?? undefined) : undefined}
          >
            <AppIcon
              name={detail.userData.played ? 'flag' : 'flagOutline'}
              size={26}
              color={detail.userData.played ? t.accent : t.textSecondary}
            />
          </TvPressable>
        </View>

        {/* 简介（TV 无按压展开交互，固定 3 行） */}
        {detail.overview !== undefined && (
          <Text style={[styles.overview, { color: t.textSecondary }]} numberOfLines={3}>
            {detail.overview}
          </Text>
        )}

        {/* 季集区（仅 Series）：季选择器 + 集列表（风险 #3 竞态守卫照搬手机） */}
        {isSeries && (
          <View style={styles.section}>
            <TvSeasonPicker
              seasons={seasons}
              selectedSeason={selectedSeason}
              onButtonTag={setSeasonPickerTag}
              onSelect={(season) => {
                selectedSeasonIdRef.current = season.id;
                setSelectedSeasonId(season.id);
                setEpisodesLoading(true);
                if (seriesId !== undefined) {
                  void loadEpisodes(seriesId, season.id);
                }
              }}
            />
            {episodesLoading ? (
              <TvLoadingSkeleton />
            ) : (
              <TvEpisodeRow
                episodeList={episodes}
                onSelectEpisode={(episode) =>
                  beginPlay({
                    id: episode.id,
                    name: `${detail.name} · S${selectedSeasonNumber}E${episode.indexNumber} ${episode.name}`,
                    type: episode.type,
                    seriesId: episode.seriesId,
                    source: toResumeSource(episode),
                  })
                }
              />
            )}
          </View>
        )}

        {/* 演员行 / 相似行（TV 路由映射收口） */}
        <TvCastRow
          peopleList={detail.peopleList}
          onSelectPerson={(personId) => navigation.navigate(ROUTES.PERSON, { personId })}
        />
        <TvSimilarRow
          itemList={similarList}
          onSelectItem={(targetItemId) =>
            navigation.navigate(ROUTES.ITEM, { itemId: targetItemId })
          }
        />
      </ScrollView>
    </TvScreenFrame>
  );
}

const createStyles = (t: ReturnType<typeof useTvTheme>) =>
  StyleSheet.create({
    content: { gap: 24, paddingBottom: 32 },
    hero: { height: 340, borderRadius: 16, overflow: 'hidden' },
    heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    heroOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    heroContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 24,
      padding: 24,
    },
    heroPoster: { width: 190, height: 285, borderRadius: 12 },
    heroPosterFallback: { backgroundColor: t.surfaceSunken },
    heroInfo: { flex: 1, gap: 10, paddingBottom: 4 },
    title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
    meta: { color: 'rgba(255,255,255,0.75)', fontSize: 16 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    playButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 32,
    },
    playButtonText: { fontSize: 20, fontWeight: '700' },
    iconButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overview: { fontSize: 17, lineHeight: 26, paddingHorizontal: 4 },
    section: { gap: 14 },
  });
