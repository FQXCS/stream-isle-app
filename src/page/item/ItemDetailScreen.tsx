/**
 * 详情页（M2 文档 §4.11 + 04 §4.4 收口 + M6 文档 §4.4.5 下载状态机）：Hero、元数据、
 * 按钮行（播放/标记已看/收藏/下载）、简介折叠、演员横滑行、剧集季集导航（仅 Series）、
 * 相似推荐行。数据经 DetailService；聚焦即刷新（useFocusEffect，覆盖播放返回/标记已看后的变化）。
 * 点播放流程：getResumePositionMs 判定 → 弹 ResumeDialog → resolve → navigate Player
 * （会话携带 itemType/seriesId 供自动连播判定，04 §4.4）；PLAYBACK_UNSUPPORTED 就地 toast。
 * M6 增量：电影按钮行第三按钮 DownloadBadge（五态下载状态机）；剧集每集行右侧图标态徽标
 * （剧集本身无单文件，下载入口必须落到集级）；完成态 tap → buildLocalSession → Player 本地播放。
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { EpisodeItem, MediaDetail, MediaLibraryItem, SeasonItem } from '@/adapter/model';
import { DownloadBadge } from '@/component/DownloadBadge';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { errorMessageOf, AppError } from '@/infra/error';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { CastRow } from '@/page/item/components/CastRow';
import { EpisodeList } from '@/page/item/components/EpisodeList';
import { HeroHeader } from '@/page/item/components/HeroHeader';
import { ResumeDialog } from '@/page/item/components/ResumeDialog';
import { SimilarRow } from '@/page/item/components/SimilarRow';
import type { RootStackParamList } from '@/page/navigation/types';
import { detailService } from '@/service/DetailService';
import { downloadService, type DownloadableItem } from '@/service/DownloadService';
import { markService } from '@/service/MarkService';
import { playbackService } from '@/service/PlaybackService';
import { getResumePositionMs, toResumeSource, type ResumeSource } from '@/util/resume';
import { formatClock } from '@/util/format';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 待续播目标（弹窗上下文：断点归属哪个条目；连播判定字段随会话下传，04 §4.4） */
interface ResumeTarget {
  itemId: string;
  resumeMs: number;
  /** 播放页控制层标题（02 §4.12「标题 · S1E2 集名」） */
  name: string;
  /** 条目类型（Episode 时播完自动连播，04 §4.4） */
  itemType: MediaDetail['type'];
  /** Episode 所属剧集 id（getNextUp 匹配用） */
  seriesId?: string;
}

/** toast 错误提示（文案一律取 ERROR_MESSAGE_MAP 唯一出处；04 §4.2 操作级失败 → Toast） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

export function ItemDetailScreen() {
  const route = useRoute<{ key: string; name: string; params: { itemId: string } }>();
  const itemId = route.params.itemId;
  const navigation = useNavigation<NavigationProp>();
  const t = useTheme();

  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [similarList, setSimilarList] = useState<MediaLibraryItem[]>([]);
  const [seasons, setSeasons] = useState<SeasonItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  // 选中季的镜像（loadDetail 聚焦刷新读取用；不进依赖——避免季切换触发 focus effect 整页重拉）
  const selectedSeasonIdRef = useRef<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  // 初始 true：剧集页首次选中季（loadDetail 异步回填 selectedSeasonId）拉取期间展示加载态；
  // 每次置位在事件处理器（季切换）或异步路径完成
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  /** 收藏乐观更新在途（防连点，04 §4.4） */
  const [markingFavorite, setMarkingFavorite] = useState(false);

  // —— 单季集列表（显式参数触发：首季回填/季切换/标记已看后刷新；不用 effect 驱动 setState）——
  const seriesId = detail?.type === 'Series' ? detail.id : undefined;
  const loadEpisodes = useCallback(
    async (targetSeriesId: string, targetSeasonId: string | null) => {
      if (targetSeasonId === null) {
        return;
      }
      try {
        const list = await detailService.loadEpisodes(targetSeriesId, targetSeasonId);
        // 响应竞态防护：快速连续切季时先发后至的结果直接丢弃（以当前选中季为准）
        if (selectedSeasonIdRef.current !== targetSeasonId) {
          return;
        }
        setEpisodes(list);
        // loading 置位在 await 之后（置 true 在季切换事件处理器/首季回填前）
        setEpisodesLoading(false);
      } catch (err) {
        // 集列表失败就地 toast（详情主体已可用，不整页换错误态）；过期请求的失败同样不消费
        if (selectedSeasonIdRef.current !== targetSeasonId) {
          return;
        }
        toastError(err);
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
        // 默认选中第一项（adapter 已按季号升序，缺失/0 排最后，02 §4.3）并随即拉取集列表；
        // 已有选中（播放返回刷新）保持用户所选季
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
      // M6：下载态聚焦刷新（SQLite → store 投影；详情返回/下载完成后徽标随 store 响应更新）
      void downloadService.refreshFromDb().catch(() => {
        // 本地快照刷新失败不阻塞页面
      });
    }, [loadDetail])
  );

  // —— 点播放流程（电影按钮与集卡片共用，02 §4.11；04 §4.4 会话携带连播判定字段）——
  const resolveAndPlay = useCallback(
    async (target: {
      itemId: string;
      startPositionMs: number;
      name: string;
      itemType: MediaDetail['type'];
      seriesId?: string;
    }) => {
      try {
        const session = await playbackService.resolve(target.itemId, {
          startPositionMs: target.startPositionMs,
        });
        setResumeTarget(null);
        navigation.navigate(ROUTES.PLAYER, {
          // 会话标题（02 §4.12 控制层「标题 · S1E2 集名」）+ 连播判定字段（04 §4.4）：
          // itemType/seriesId 由详情页拼好传入，播完 EPISODE 分支据此走 getNextUp
          session: {
            ...session,
            name: target.name,
            itemType: target.itemType,
            seriesId: target.seriesId,
          },
        });
      } catch (err) {
        setResumeTarget(null);
        toastError(err);
      }
    },
    [navigation]
  );

  const beginPlay = useCallback(
    (target: ResumeSource & { id: string; name: string; type: MediaDetail['type']; seriesId?: string }) => {
      const resumeMs = getResumePositionMs(target);
      if (resumeMs !== null) {
        setResumeTarget({
          itemId: target.id,
          resumeMs,
          name: target.name,
          itemType: target.type,
          seriesId: target.seriesId,
        });
        return;
      }
      void resolveAndPlay({
        itemId: target.id,
        startPositionMs: 0,
        name: target.name,
        itemType: target.type,
        seriesId: target.seriesId,
      });
    },
    [resolveAndPlay]
  );

  // —— M6：下载发起（电影按钮行/集行共用；DOWNLOAD_UNAVAILABLE/NO_SPACE/DUPLICATE 就地 toast，06 §4.4.5）——
  const startDownloadFor = useCallback((downloadItem: DownloadableItem) => {
    void downloadService.startDownload(downloadItem).catch((err: unknown) => {
      toastError(err);
    });
  }, []);

  // —— M6：本地播放（完成态 tap → buildLocalSession → Player；06 §4.4.5）——
  const playLocal = useCallback(
    (localItemId: string) => {
      void (async () => {
        try {
          const session = await downloadService.buildLocalSession(localItemId);
          navigation.navigate(ROUTES.PLAYER, { session });
        } catch (err) {
          toastError(err);
        }
      })();
    },
    [navigation]
  );

  // —— 标记已看 toggle（手动按钮，A9；M4 回归）——
  const togglePlayed = useCallback(async () => {
    if (detail === null || marking) {
      return;
    }
    setMarking(true);
    try {
      await markService.setPlayed(detail.id, !detail.userData.played);
      // 标记成功后刷新 UserData（按钮文案/集列表勾随之变化）
      const refreshed = await detailService.loadDetail(detail.id);
      setDetail(refreshed);
      if (refreshed.type === 'Series' && seriesId !== undefined) {
        await loadEpisodes(seriesId, selectedSeasonIdRef.current);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setMarking(false);
    }
  }, [detail, marking, loadEpisodes, seriesId]);

  // —— 收藏 toggle（04 §4.4 新增）：乐观更新——立即翻转 UI → await → 失败回滚 + Toast ——
  const toggleFavorite = useCallback(async () => {
    if (detail === null || markingFavorite) {
      return;
    }
    const nextFavorite = !detail.userData.favorite;
    const previous = detail.userData.favorite;
    setMarkingFavorite(true);
    // 立即翻转 UI（04 §4.4 乐观更新规则）
    setDetail({ ...detail, userData: { ...detail.userData, favorite: nextFavorite } });
    try {
      await markService.setFavorite(detail.id, nextFavorite);
    } catch (err) {
      // 失败回滚 + Toast（04 §4.4）
      setDetail({ ...detail, userData: { ...detail.userData, favorite: previous } });
      toastError(err);
    } finally {
      setMarkingFavorite(false);
    }
  }, [detail, markingFavorite]);

  // —— 集列表已看勾 toggle（04 §4.4 新增）：乐观更新同款，失败回滚 + Toast ——
  const toggleEpisodePlayed = useCallback(async (episode: EpisodeItem) => {
    const nextPlayed = !episode.userData.played;
    const patch = (played: boolean) => {
      setEpisodes((current) =>
        current.map((item) =>
          item.id === episode.id
            ? { ...item, userData: { ...item.userData, played } }
            : item
        )
      );
    };
    patch(nextPlayed);
    try {
      await markService.setPlayed(episode.id, nextPlayed);
    } catch (err) {
      patch(episode.userData.played);
      toastError(err);
    }
  }, []);

  if (detail === null) {
    if (error !== null) {
      return (
        <View style={[styles.fill, { backgroundColor: t.bg }]}>
          <ErrorView error={error} onRetry={() => void loadDetail()} />
        </View>
      );
    }
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <LoadingView />
      </View>
    );
  }

  const isSeries = detail.type === 'Series';
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;
  const resumeMs = getResumePositionMs(toResumeSource(detail));
  // Series 无媒体流（对 Series id 发 PlaybackInfo 必然空 MediaSources → PLAYBACK_UNSUPPORTED），
  // 主按钮改为「播放第一集」：当前选中季优先第一个未看集，无集（未加载完/空季）时不渲染主按钮
  const firstPlayableEpisode = isSeries
    ? (episodes.find((episode) => !episode.userData.played) ?? episodes[0] ?? null)
    : null;
  // M6：下载入口仅电影/集级开放（仅可直连条目，服务端 startDownload 判定，设计文档 §7.7）
  const selectedSeasonNumber = selectedSeason?.indexNumber ?? 0;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroHeader detail={detail} />
        {/* 按钮行（02 §4.11 + 04 §4.4 收藏按钮 + 06 §4.4.5 下载徽标）：
            主按钮文案随续播判定变化；Series 为「播放第一集」 */}
        <View style={styles.buttonRow}>
          {!isSeries && (
            <Pressable
              style={[styles.playButton, { backgroundColor: t.accent }]}
              onPress={() =>
                beginPlay({
                  id: detail.id,
                  name: detail.name,
                  type: detail.type,
                  // 单集详情（继续观看/搜索集条目进入）携带所属剧集 id：播完自动连播按剧集匹配，
                  // 电影条目该字段为 undefined（连播链路 seriesId 缺失即不连播）
                  seriesId: detail.seriesId,
                  ...toResumeSource(detail),
                })
              }
            >
              <Text style={[styles.playButtonText, { color: t.accentOn }]}>
                {resumeMs !== null ? `从 ${formatClock(resumeMs)} 继续` : '播放'}
              </Text>
            </Pressable>
          )}
          {isSeries && firstPlayableEpisode !== null && (
            <Pressable
              style={[styles.playButton, { backgroundColor: t.accent }]}
              onPress={() =>
                beginPlay({
                  id: firstPlayableEpisode.id,
                  name: `${detail.name} · S${selectedSeasonNumber}E${firstPlayableEpisode.indexNumber} ${firstPlayableEpisode.name}`,
                  type: firstPlayableEpisode.type,
                  seriesId: firstPlayableEpisode.seriesId,
                  ...toResumeSource(firstPlayableEpisode),
                })
              }
            >
              <Text style={[styles.playButtonText, { color: t.accentOn }]}>播放第一集</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.markButton, { backgroundColor: t.surface }]}
            onPress={() => void togglePlayed()}
          >
            <Text style={[styles.markButtonText, { color: t.textSecondary }]}>
              {detail.userData.played ? '标记未看' : '标记已看'}
            </Text>
          </Pressable>
          {/* 收藏按钮（04 §4.4 新增）：文案随收藏态翻转 */}
          <Pressable
            style={[styles.markButton, { backgroundColor: t.surface }]}
            onPress={() => void toggleFavorite()}
          >
            <Text style={[styles.markButtonText, { color: t.textSecondary }]}>
              {detail.userData.favorite ? '已收藏' : '收藏'}
            </Text>
          </Pressable>
          {/* M6 下载徽标（电影：按钮行第三按钮；仅可直连条目可下，判定在服务层，06 §4.4.5） */}
          {!isSeries && (
            <DownloadBadge
              itemId={detail.id}
              onStart={() => startDownloadFor(detail)}
              onPlayLocal={() => playLocal(detail.id)}
            />
          )}
        </View>
        {/* 简介：3 行折叠展开 */}
        {detail.overview !== undefined && (
          <Pressable style={styles.overviewBox} onPress={() => setOverviewExpanded((v) => !v)}>
            <Text style={[styles.overview, { color: t.textSecondary }]} numberOfLines={overviewExpanded ? undefined : 3}>
              {detail.overview}
            </Text>
          </Pressable>
        )}
        <CastRow peopleList={detail.peopleList} />
        {/* 剧集区（仅 Series）：季下拉选择器 + 集列表 */}
        {isSeries && (
          <View style={styles.section}>
            <SeasonPicker
              seasons={seasons}
              selectedSeason={selectedSeason}
              open={seasonPickerOpen}
              onToggle={() => setSeasonPickerOpen((v) => !v)}
              onSelect={(season) => {
                selectedSeasonIdRef.current = season.id;
                setSelectedSeasonId(season.id);
                setEpisodesLoading(true);
                setSeasonPickerOpen(false);
                if (seriesId !== undefined) {
                  void loadEpisodes(seriesId, season.id);
                }
              }}
            />
            {episodesLoading ? (
              <LoadingView />
            ) : (
              <EpisodeList
                episodeList={episodes}
                onSelectEpisode={(episode) =>
                  beginPlay({
                    id: episode.id,
                    name: `${detail.name} · S${selectedSeasonNumber}E${episode.indexNumber} ${episode.name}`,
                    type: episode.type,
                    seriesId: episode.seriesId,
                    ...toResumeSource(episode),
                  })
                }
                onTogglePlayed={(episode) => void toggleEpisodePlayed(episode)}
                renderTrailing={(episode) => (
                  <DownloadBadge
                    itemId={episode.id}
                    compact
                    onStart={() =>
                      startDownloadFor({
                        ...episode,
                        seriesName: detail.name,
                        seasonNumber: selectedSeasonNumber,
                      })
                    }
                    onPlayLocal={() => playLocal(episode.id)}
                  />
                )}
              />
            )}
          </View>
        )}
        <SimilarRow itemList={similarList} />
      </ScrollView>
      {resumeTarget !== null && (
        <ResumeDialog
          resumeMs={resumeTarget.resumeMs}
          onResume={() =>
            void resolveAndPlay({
              itemId: resumeTarget.itemId,
              startPositionMs: resumeTarget.resumeMs,
              name: resumeTarget.name,
              itemType: resumeTarget.itemType,
              seriesId: resumeTarget.seriesId,
            })
          }
          onRestart={() =>
            void resolveAndPlay({
              itemId: resumeTarget.itemId,
              startPositionMs: 0,
              name: resumeTarget.name,
              itemType: resumeTarget.itemType,
              seriesId: resumeTarget.seriesId,
            })
          }
        />
      )}
    </View>
  );
}

/** 季下拉选择器（对齐设计文档 §7.1「季下拉切换」；下拉面板列出排序后的全部季） */
function SeasonPicker({
  seasons,
  selectedSeason,
  open,
  onToggle,
  onSelect,
}: {
  seasons: SeasonItem[];
  selectedSeason: SeasonItem | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (season: SeasonItem) => void;
}) {
  const t = useTheme();
  const label = selectedSeason !== null ? seasonLabelOf(selectedSeason) : '选择季';
  return (
    <View style={styles.pickerWrap}>
      <Pressable
        style={[styles.pickerButton, { backgroundColor: t.surface }]}
        onPress={onToggle}
      >
        <Text style={[styles.pickerText, { color: t.textPrimary }]}>{label}</Text>
        <Text style={[styles.pickerArrow, { color: t.textSecondary }]}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={[styles.pickerPanel, { backgroundColor: t.surfaceElevated }]}>
          {seasons.map((season) => (
            <Pressable key={season.id} style={styles.pickerItem} onPress={() => onSelect(season)}>
              <Text
                style={[
                  styles.pickerItemText,
                  { color: t.textPrimary },
                  season.id === selectedSeason?.id && { color: t.accent },
                ]}
              >
                {seasonLabelOf(season)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** 季展示文案（季号 0/缺失为特别篇惯例） */
function seasonLabelOf(season: SeasonItem): string {
  return season.indexNumber > 0 ? `第 ${season.indexNumber} 季` : '特别篇';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: SPACING.xl },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.m,
  },
  playButton: {
    flex: 1,
    minWidth: 120,
    borderRadius: POSTER_RADIUS,
    paddingVertical: SPACING.m,
    alignItems: 'center',
  },
  playButtonText: { fontSize: FONT_SIZE.title },
  markButton: {
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    alignItems: 'center',
  },
  markButtonText: { fontSize: FONT_SIZE.body },
  overviewBox: { paddingHorizontal: SPACING.l, marginTop: SPACING.m },
  overview: { fontSize: FONT_SIZE.body, lineHeight: 22 },
  section: { marginTop: SPACING.l, gap: SPACING.m },
  pickerWrap: { position: 'relative', paddingHorizontal: SPACING.l },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    alignSelf: 'flex-start',
  },
  pickerText: { fontSize: FONT_SIZE.body },
  pickerArrow: { fontSize: FONT_SIZE.body },
  pickerPanel: {
    position: 'absolute',
    top: 44,
    left: SPACING.l,
    zIndex: 10,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.s,
    minWidth: 140,
    elevation: 8,
  },
  pickerItem: { paddingVertical: SPACING.s, paddingHorizontal: SPACING.m },
  pickerItemText: { fontSize: FONT_SIZE.body },
});
