/**
 * 详情页（M2 文档 §4.11 + 04 §4.4 收口 + M6 §4.4.5 下载状态机 + M8 参考稿重排）：
 * Hero（返回/更多浮层 + 居中标题与元数据）、大播放按钮 + 收藏/已看图标、
 * 音视频字幕信息卡、简介折叠、剧集季集导航（仅 Series）、演员横滑行、相似推荐行、
 * 底部文件信息卡；「更多」菜单承载下载与已看标记（参考稿）。
 * 数据经 DetailService；聚焦即刷新（useFocusEffect，覆盖播放返回/标记已看后的变化）。
 * 点播放流程：按「断点续播」设置取断点（关闭/无效 → 0）→ resolve → navigate Player
 * （会话携带 itemType/seriesId 供自动连播判定，04 §4.4）；PLAYBACK_UNSUPPORTED 就地 toast。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  EpisodeItem,
  MediaDetail,
  MediaItemTypeEnum,
  MediaLibraryItem,
  SeasonItem,
} from '@/adapter/model';
import { AnchorMenu, type AnchorMenuItem, type AnchorRect } from '@/component/AnchorMenu';
import { AppIcon } from '@/component/AppIcon';
import { DownloadBadge } from '@/component/DownloadBadge';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { useT, type Translator } from '@/i18n';
import { errorMessageOf, AppError } from '@/infra/error';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { CastRow } from '@/page/item/components/CastRow';
import { EpisodeList } from '@/page/item/components/EpisodeList';
import { HeroHeader } from '@/page/item/components/HeroHeader';
import { MediaFileCard, MediaInfoSection } from '@/page/item/components/MediaInfoSection';
import { SimilarRow } from '@/page/item/components/SimilarRow';
import type { RootStackParamList } from '@/page/navigation/types';
import { bookSizeService } from '@/service/BookSizeService';
import { detailService } from '@/service/DetailService';
import { downloadService, type DownloadableItem } from '@/service/DownloadService';
import { itemActionService } from '@/service/ItemActionService';
import { markService } from '@/service/MarkService';
import { playbackService } from '@/service/PlaybackService';
import { useDownloadStore } from '@/store/downloadStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getResumePositionMs, toResumeSource, type ResumeSource } from '@/util/resume';
import { formatClock, formatRuntime } from '@/util/format';
import { formatBytes } from '@/util/formatBytes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** toast 错误提示（文案一律取 ERROR_MESSAGE_MAP 唯一出处；04 §4.2 操作级失败 → Toast） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

/** 单文件可播类型（电影/集/家庭视频/预告片/音乐视频）；剧集与图书走各自的元数据口径 */
function isMediaFlowType(type: MediaItemTypeEnum): boolean {
  return (
    type === 'Movie' ||
    type === 'Episode' ||
    type === 'Video' ||
    type === 'Trailer' ||
    type === 'MusicVideo'
  );
}

/**
 * 详情页元数据行：单文件条目取参考稿技术口径「时长 · 大小 · 720p HEVC」；
 * 技术字段缺失或剧集/图书时回退「年份 · 分级 · 评分 · 时长 · 类型」。
 */
function metaTextOf(detail: MediaDetail): string {
  if (isMediaFlowType(detail.type)) {
    const source = detail.mediaSourceList[0];
    const video = source?.videoStreamList?.[0];
    const parts: string[] = [];
    if (detail.runtimeMs !== undefined && detail.runtimeMs > 0) {
      parts.push(formatRuntime(detail.runtimeMs));
    }
    if (source?.sizeBytes !== undefined) {
      parts.push(formatBytes(source.sizeBytes));
    }
    if (video?.height !== undefined) {
      // 分辨率档位取短边（竖屏 1080x1440 展示 1080p，与 Emby DisplayTitle 口径一致）
      const shortSide =
        video.width !== undefined ? Math.min(video.width, video.height) : video.height;
      const resolution = `${shortSide}p`;
      parts.push(video.codec !== undefined ? `${resolution} ${video.codec.toUpperCase()}` : resolution);
    }
    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }
  const legacyParts: string[] = [];
  if (detail.productionYear !== undefined) {
    legacyParts.push(String(detail.productionYear));
  }
  if (detail.officialRating !== undefined) {
    legacyParts.push(detail.officialRating);
  }
  if (detail.runtimeMs !== undefined) {
    legacyParts.push(formatClock(detail.runtimeMs));
  }
  // 图书等无播放轨道的条目：详情接口带回 MediaSources.Size 时展示文件大小
  const legacySize = detail.mediaSourceList[0]?.sizeBytes;
  if (legacySize !== undefined) {
    legacyParts.push(formatBytes(legacySize));
  }
  if (detail.genreList.length > 0) {
    legacyParts.push(detail.genreList.slice(0, 3).join(' '));
  }
  return legacyParts.join(' · ');
}

export function ItemDetailScreen() {
  const route = useRoute<{ key: string; name: string; params: { itemId: string } }>();
  const itemId = route.params.itemId;
  const navigation = useNavigation<NavigationProp>();
  const t = useTheme();
  const tr = useT();
  const resumePlaybackEnabled = useSettingsStore((state) => state.resumePlaybackEnabled);

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
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  /** 收藏乐观更新在途（防连点，04 §4.4） */
  const [markingFavorite, setMarkingFavorite] = useState(false);
  /** 「更多」菜单（null=关闭；参考稿顶部右侧入口；菜单项在打开时按当前状态构建） */
  const [moreMenu, setMoreMenu] = useState<{
    anchor: AnchorRect;
    itemList: AnchorMenuItem[];
  } | null>(null);

  // 主条目的下载任务（「更多」菜单下载入口按五态显示文案）
  const downloadTask = useDownloadStore((state) =>
    detail === null ? undefined : state.taskMap[detail.id]
  );

  // 图书文件大小：Book DTO 不带 Size，详情打开后经下载端点惰性探测（与库卡片共用缓存）
  const bookItemId = detail !== null && detail.type === 'Book' ? detail.id : null;
  const [bookSizeText, setBookSizeText] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (bookItemId === null) {
      return;
    }
    let cancelled = false;
    void bookSizeService.loadSize(bookItemId).then((bytes) => {
      if (!cancelled && bytes !== null) {
        setBookSizeText(formatBytes(bytes));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookItemId]);

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
        toastError(err);
      }
    },
    [navigation]
  );

  const beginPlay = useCallback(
    (target: ResumeSource & { id: string; name: string; type: MediaDetail['type']; seriesId?: string }) => {
      // 「断点续播」关闭或断点无效（已看完/过短/接近片尾）→ 从头播；不再弹选择框
      const resumeMs = useSettingsStore.getState().resumePlaybackEnabled
        ? getResumePositionMs(target)
        : null;
      void resolveAndPlay({
        itemId: target.id,
        startPositionMs: resumeMs ?? 0,
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

  // —— 标记已看（手动图标/菜单，A9；M4 回归）：显式目标态，成功后刷新 UserData ——
  const updatePlayedState = useCallback(
    async (played: boolean) => {
      if (detail === null || marking) {
        return;
      }
      setMarking(true);
      try {
        await markService.setPlayed(detail.id, played);
        // 标记成功后刷新 UserData（图标态/集列表勾随之变化）
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
    },
    [detail, marking, loadEpisodes, seriesId]
  );

  const togglePlayed = useCallback(() => {
    if (detail !== null) {
      void updatePlayedState(!detail.userData.played);
    }
  }, [detail, updatePlayedState]);

  /** 「更多」菜单下载入口：无任务→发起；在途→下载页；暂停/失败→续传/重试；完成→本地播放 */
  const handleMoreDownload = useCallback(() => {
    if (detail === null) {
      return;
    }
    if (downloadTask === undefined) {
      startDownloadFor(detail);
      return;
    }
    switch (downloadTask.status) {
      case 'queued':
      case 'downloading':
        navigation.navigate(ROUTES.DOWNLOADS);
        break;
      case 'paused':
        void downloadService.resumeDownload(detail.id).catch(() => {
          showToast(errorMessageOf('UNKNOWN'), 'error');
        });
        break;
      case 'completed':
        playLocal(detail.id);
        break;
      case 'failed':
        void downloadService.retryDownload(detail.id).catch(() => {
          showToast(errorMessageOf('UNKNOWN'), 'error');
        });
        break;
      default:
        startDownloadFor(detail);
    }
  }, [detail, downloadTask, navigation, playLocal, startDownloadFor]);

  /** 删除当前条目（详情「更多」菜单；服务器删除权限，成功后返回列表） */
  const handleDeleteItem = useCallback(() => {
    if (detail === null) {
      return;
    }
    Alert.alert(
      tr('item.deleteTitle'),
      tr('item.deleteMessage', { name: detail.name }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('common.delete'),
          style: 'destructive',
          onPress: () => {
            void itemActionService
              .deleteItem(detail.id)
              .then(() => {
                showToast(tr('item.deleted'));
                navigation.goBack();
              })
              .catch(toastError);
          },
        },
      ]
    );
  }, [detail, navigation, tr]);

  /** 打开「更多」菜单：按当前条目/下载/已看状态构建菜单项（事件期构建，避免渲染期读取状态） */
  const handleOpenMore = useCallback(
    (anchor: AnchorRect) => {
      if (detail === null) {
        return;
      }
      const itemList: AnchorMenuItem[] = [];
      if (isMediaFlowType(detail.type)) {
        const downloadLabel =
          downloadTask === undefined
            ? tr('action.download')
            : downloadTask.status === 'completed'
              ? tr('download.playLocal')
              : downloadTask.status === 'paused'
                ? tr('download.resume')
                : downloadTask.status === 'failed'
                  ? tr('download.retry')
                  : tr('download.downloadingShort');
        itemList.push({
          key: 'download',
          label: downloadLabel,
          icon: downloadTask?.status === 'completed' ? 'play' : 'download',
          onPress: handleMoreDownload,
        });
      }
      itemList.push(
        {
          key: 'played',
          label: tr('item.markPlayed'),
          icon: 'flag',
          disabled: marking,
          onPress: () => void updatePlayedState(true),
        },
        {
          key: 'unplayed',
          label: tr('item.markUnplayed'),
          icon: 'flagOutline',
          disabled: marking,
          onPress: () => void updatePlayedState(false),
        },
        {
          key: 'delete',
          label: tr('common.delete'),
          icon: 'trash',
          tone: 'danger',
          onPress: handleDeleteItem,
        }
      );
      setMoreMenu({ anchor, itemList });
    },
    [
      detail,
      downloadTask,
      handleDeleteItem,
      handleMoreDownload,
      marking,
      tr,
      updatePlayedState,
    ]
  );

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
  // Book 主按钮为「阅读」（M7）：不发 PlaybackInfo（Emby 对 Book 必 500，Book 未实现
  // IHasMediaSources），也不开放下载；Movie/Episode 走播放链路
  const isBook = detail.type === 'Book';
  // Movie/Episode/Video/Trailer/MusicVideo 走播放链路；家庭视频库的 Video 条目同样可播
  const isPlayable =
    detail.type === 'Movie' ||
    detail.type === 'Episode' ||
    detail.type === 'Video' ||
    detail.type === 'Trailer' ||
    detail.type === 'MusicVideo';
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;
  // 「断点续播」关闭时主按钮不再显示续播时间（与实际起播行为一致）
  const resumeMs = resumePlaybackEnabled ? getResumePositionMs(toResumeSource(detail)) : null;
  // 续播按钮底色进度：已看时长占片长比例（无时长/无断点时不填充）
  const resumeRatio =
    resumeMs !== null && detail.runtimeMs !== undefined && detail.runtimeMs > 0
      ? Math.min(1, resumeMs / detail.runtimeMs)
      : 0;
  // Series 无媒体流（对 Series id 发 PlaybackInfo 必然空 MediaSources → PLAYBACK_UNSUPPORTED），
  // 主按钮改为「播放第一集」：当前选中季优先第一个未看集，无集（未加载完/空季）时不渲染主按钮
  const firstPlayableEpisode = isSeries
    ? (episodes.find((episode) => !episode.userData.played) ?? episodes[0] ?? null)
    : null;
  // M6：下载入口仅电影/集级开放（仅可直连条目，服务端 startDownload 判定，设计文档 §7.7）
  const selectedSeasonNumber = selectedSeason?.indexNumber ?? 0;
  // 评分仅非媒体流条目展示（与 metaTextOf 原口径一致），改由 HeroHeader 以图标 + 数字渲染
  const metaRating = !isMediaFlowType(detail.type) ? detail.communityRating : undefined;
  const baseMetaText = metaTextOf(detail);
  const metaText =
    bookSizeText === undefined
      ? baseMetaText
      : baseMetaText === ''
        ? bookSizeText
        : `${baseMetaText} · ${bookSizeText}`;
  // 主播放按钮：主色药丸 + accentOn 图标/文案（浅色主题下建立明确主操作）
  const playButtonStyle = [
    styles.playButton,
    { backgroundColor: t.accent, borderColor: t.accent },
  ];
  const playButtonTextStyle = [styles.playButtonText, { color: t.accentOn }];

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroHeader
          detail={detail}
          metaText={metaText}
          rating={metaRating}
          onBack={() => navigation.goBack()}
          onMore={handleOpenMore}
        />
        {/* 操作区（参考稿）：大播放按钮 + 收藏/已看图标 */}
        <View style={styles.actionBlock}>
          {/* Book 主按钮「阅读」（M7 内置阅读器，绕开播放链路） */}
          {isBook && (
            <Pressable
              style={playButtonStyle}
              onPress={() =>
                navigation.navigate(ROUTES.BOOK_READER, { itemId: detail.id, name: detail.name })
              }
            >
              <AppIcon name="file" size={18} color={t.accentOn} />
              <Text style={playButtonTextStyle}>{tr('item.read')}</Text>
            </Pressable>
          )}
          {isPlayable && (
            <Pressable
              style={playButtonStyle}
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
              {/* 已看进度底色（宽度 = 断点/片长），点击后从该位置继续 */}
              {resumeMs !== null && resumeRatio > 0 && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.playProgressFill,
                    { width: `${resumeRatio * 100}%`, backgroundColor: 'rgba(255,255,255,0.24)' },
                  ]}
                />
              )}
              <AppIcon name="play" size={18} color={t.accentOn} />
              <Text style={playButtonTextStyle}>
                {resumeMs !== null
                  ? tr('item.continueFrom', { time: formatClock(resumeMs) })
                  : tr('action.play')}
              </Text>
            </Pressable>
          )}
          {isSeries && firstPlayableEpisode !== null && (
            <Pressable
              style={playButtonStyle}
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
              <AppIcon name="play" size={18} color={t.accentOn} />
              <Text style={playButtonTextStyle}>{tr('item.playFirstEpisode')}</Text>
            </Pressable>
          )}
          {/* 收藏 / 已看图标（参考稿：播放按钮下方居中两枚图标） */}
          <View style={styles.iconRow}>
            <Pressable
              style={[styles.iconButton, { backgroundColor: t.surface, borderColor: t.separator }]}
              onPress={() => void toggleFavorite()}
              accessibilityLabel={
                detail.userData.favorite ? tr('action.unfavorite') : tr('action.favorite')
              }
            >
              <AppIcon
                name={detail.userData.favorite ? 'heart' : 'heartOutline'}
                size={24}
                color={detail.userData.favorite ? t.accent : t.textSecondary}
              />
            </Pressable>
            <Pressable
              style={[styles.iconButton, { backgroundColor: t.surface, borderColor: t.separator }]}
              onPress={togglePlayed}
              accessibilityLabel={
                detail.userData.played ? tr('item.markUnplayed') : tr('item.markPlayed')
              }
            >
              <AppIcon
                name={detail.userData.played ? 'flag' : 'flagOutline'}
                size={24}
                color={detail.userData.played ? t.accent : t.textSecondary}
              />
            </Pressable>
          </View>
        </View>
        {/* 音视频字幕信息（参考稿信息卡） */}
        <MediaInfoSection detail={detail} />
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
        {/* 文件信息卡（参考稿底部：路径 + 技术元数据） */}
        {detail.path !== undefined && <MediaFileCard path={detail.path} metaText={metaText} />}
      </ScrollView>
      <AnchorMenu
        anchor={moreMenu?.anchor ?? null}
        itemList={moreMenu?.itemList ?? []}
        onClose={() => setMoreMenu(null)}
      />
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
  const tr = useT();
  const label =
    selectedSeason !== null ? seasonLabelOf(selectedSeason, tr) : tr('item.selectSeason');
  return (
    <View style={styles.pickerWrap}>
      <Pressable
        style={[styles.pickerButton, { backgroundColor: t.surface }]}
        onPress={onToggle}
      >
        <Text style={[styles.pickerText, { color: t.textPrimary }]}>{label}</Text>
        <AppIcon
          name={open ? 'chevronUp' : 'chevronDown'}
          size={14}
          color={t.textSecondary}
        />
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
                {seasonLabelOf(season, tr)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** 季展示文案（季号 0/缺失为特别篇惯例） */
function seasonLabelOf(season: SeasonItem, tr: Translator): string {
  return season.indexNumber > 0
    ? tr('item.seasonNumber', { number: season.indexNumber })
    : tr('item.specialSeason');
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: SPACING.xl },
  actionBlock: {
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.m,
    alignItems: 'center',
    gap: SPACING.s,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  playProgressFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  playButtonText: { fontSize: FONT_SIZE.title, fontWeight: '600' },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    marginTop: SPACING.xs,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewBox: { paddingHorizontal: SPACING.l, marginTop: SPACING.l },
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
