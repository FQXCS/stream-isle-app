/**
 * 音频引擎服务（M5 文档 §4.5；设计文档 §7.5）：队列 / 播放模式 / 会话生命周期编排。
 * 定位：唯一与 @rntp/player（track-player v5）对话的应用层入口（UI 一律经它，不直呼 TrackPlayer.*）；
 * 播放决策复用 PlaybackService.resolveAudio（universal 统一端点，两引擎共用决策）；
 * 事件→上报接线（30s 节流 / 切歌 Stopped）拆至同包 AudioReporting 协作类（AGENTS 类长度拆分）。
 *
 * 队列真源在 track-player 原生侧；playerStore.audio 只镜像 UI 需要的少量状态，
 * 队列全量仅在队列页打开时经 getQueueSnapshot() 拉取，不进 store、不持久化。
 *
 * **模块级单例**（导出 audioService）：事件订阅与上报必须与应用生命周期等长，不随页面挂载/卸载。
 * 拔耳机暂停（A11）：v5 setupPlayer 的 handleAudioBecomingNoisy（默认 true）原生承担，
 * 不暴露 JS 事件——拔耳机触发原生暂停后走 AudioReporting 的 IsPlayingChanged(false) 分支
 * 即时上报 Progress(IsPaused=true)，无需本地 receiver 模块。
 * v5 远程控制（通知栏/锁屏/蓝牙）默认 native handling 原生直处理，JS 侧无 Remote 事件
 * （原 v4 registerPlaybackService/handleRemoteEvent 链路随之移除），播放后果经
 * PlaybackStateChanged/IsPlayingChanged 事件回流上报。
 */
import TrackPlayer, {
  PlayerCommand,
  RepeatMode,
  type MediaItem,
} from '@rntp/player';

import type { AudioItem, LyricLine, PlaybackSession, RepeatModeEnum } from '@/adapter/model';
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import {
  AUDIO_PROGRESS_UPDATE_EVENT_INTERVAL_S,
  PREVIOUS_RESTART_THRESHOLD_MS,
} from '@/constant/audio';
import { AppError, errorMessageOf } from '@/infra/error';
import { t } from '@/i18n';
import { getActiveAdapter } from '@/service/adapterProvider';
import { playbackService } from '@/service/PlaybackService';
import { AudioReporting, type AudioReportingHost } from '@/service/AudioReporting';
import { showCenterToast, showToast } from '@/component/Toast';
import { useAccountStore } from '@/store/accountStore';
import { usePlayerStore } from '@/store/playerStore';
import { combinedPlaybackMode, type PlaybackModeEnum } from '@/util/playbackMode';
import { newUid } from '@/util/uuid';

/** 歌词加载取活跃 userId（入口仅 Now Playing 页，UI 路由守卫保证有活跃账号） */
function requireActiveUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 AudioService.loadLyrics');
  }
  return active.userId;
}

/** adapter 获取函数（组装入口注入，缺省取活跃账号实例；单测以 fake adapter 断言调用序列） */
export type GetAdapterFn = () => ServerAdapter;

/** 音频决策函数（缺省 = PlaybackService.resolveAudio；单测可注入假决策） */
export type ResolveAudioFn = (
  itemId: string,
  opts?: { playSessionId?: string; runTimeMs?: number }
) => Promise<PlaybackSession>;

export interface AudioServiceDeps {
  getAdapter: GetAdapterFn;
  resolveAudio?: ResolveAudioFn;
}

/** 队列页行渲染形态（MediaItem 元数据直读映射，不进 store；getQueueSnapshot 产出） */
export interface AudioQueueEntry {
  id: string;
  title: string;
  artist?: string;
  /** 专辑名（队列行副标题「艺人 - 专辑」） */
  album?: string;
  /** 通知栏 artwork / 封面缩略（带 token 完整 URL） */
  coverUrl?: string;
  durationMs?: number;
}

/** 相邻曲预览（迷你条左右滑时的下一首/上一首标题） */
export interface AdjacentTrackPreview {
  id: string;
  title: string;
  artist?: string;
}

/** RepeatModeEnum → @rntp/player RepeatMode 映射（05 文档 §4.5；v5：track→One、queue→All） */
function toNativeRepeatMode(mode: RepeatModeEnum): RepeatMode {
  if (mode === 'off') {
    return RepeatMode.Off;
  }
  if (mode === 'track') {
    return RepeatMode.One;
  }
  return RepeatMode.All;
}

/** AudioItem + universal URL → v5 MediaItem（artworkUrl 为带 token 完整 URL，原生加载） */
function toMediaItem(audio: AudioItem, url: string): MediaItem {
  return {
    mediaId: audio.id,
    url,
    title: audio.name,
    artist: audio.artistName,
    albumTitle: audio.albumName,
    artworkUrl: audio.coverImageUrl,
    duration: audio.runtimeMs !== undefined ? audio.runtimeMs / 1000 : undefined,
  };
}

/** Fisher-Yates 原地打乱（返回新数组，不改入参） */
function fisherYatesShuffle<T>(input: readonly T[]): T[] {
  const list = [...input];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export class AudioService {
  private readonly getAdapter: GetAdapterFn;

  private readonly resolveAudioFn: ResolveAudioFn;

  /** 事件→上报接线协作类（30s 节流 / 切歌 Stopped / 状态镜像，见 AudioReporting 文件头） */
  private readonly reporting: AudioReporting;

  /** ensureSetup 幂等 promise（并发去重；失败清空允许重试） */
  private setupPromise: Promise<void> | null = null;

  /** 事件订阅一次性标记（attachPlaybackSession 幂等挂载） */
  private eventsSubscribed = false;

  /** 当前活跃 playSessionId（队列会话级，§4.4：任何时刻有且仅有一个活跃值） */
  private activePlaySessionId: string | null = null;

  /** 当前曲会话（上报 Playing/Progress/Stopped 的载体） */
  private activeSession: PlaybackSession | null = null;

  /** 随机模式前的原序队列快照（曲目 id 序，关闭随机时恢复） */
  private originalTrackIdOrder: string[] = [];

  /** 曲目 id → AudioItem（当前曲镜像与时长换算的查询表；随队列增删同步） */
  private audioItemById = new Map<string, AudioItem>();

  /** 曲目 id → 歌词（M6 §4.6.3：切歌时加载，随队列当前曲目缓存；null = 暂无歌词） */
  private lyricsCache = new Map<string, LyricLine[] | null>();

  /** 歌词在途请求去重（同曲重复 loadLyrics 只发一次） */
  private lyricsPending = new Map<string, Promise<LyricLine[] | null>>();

  constructor(deps: AudioServiceDeps, nowFn: () => number = Date.now) {
    this.getAdapter = deps.getAdapter;
    this.resolveAudioFn = deps.resolveAudio ?? playbackService.resolveAudio.bind(playbackService);
    const host: AudioReportingHost = {
      getAdapter: () => this.getAdapter(),
      getActiveSession: () => this.activeSession,
      getPlaySessionId: () => this.activePlaySessionId,
      activateTrack: (track) => this.activateTrack(track),
    };
    this.reporting = new AudioReporting(host, nowFn);
  }

  /**
   * 播放会话挂载（index.ts 经 TrackPlayer.registerPlaybackSession 调用，官方要求在
   * 应用注册前执行；幂等）：订阅播放事件，监听器与 JS runtime 生命周期等长
   * （后台/熄屏仍存活，v5 官方推荐的播放逻辑挂载点）。
   */
  attachPlaybackSession(): void {
    if (this.eventsSubscribed) {
      return;
    }
    this.eventsSubscribed = true;
    this.reporting.subscribe();
  }

  /**
   * 引擎初始化（幂等，首次起播前调用）：setupPlayer + setCommands（05 §4.9）。
   * v5 两步均为同步调用；handleAudioBecomingNoisy 覆盖拔耳机暂停（A11，见文件头），
   * 音频焦点打断（通话/他 App 抢焦点）由 v5 原生 focus 处理。
   */
  async ensureSetup(): Promise<void> {
    if (this.setupPromise !== null) {
      return this.setupPromise;
    }
    this.setupPromise = (async () => {
      TrackPlayer.setupPlayer({
        contentType: 'music',
        // 拔耳机暂停（A11）：显式声明固定契约（v5 默认即 true）
        handleAudioBecomingNoisy: true,
        // 原生进度事件间隔（熄屏/后台仍发，承担节流上报的「时钟」角色，对应 v4 progressUpdateEventInterval）
        progressSync: { intervalSeconds: AUDIO_PROGRESS_UPDATE_EVENT_INTERVAL_S },
        // 杀进程/从最近任务划掉 = 停止播放并拆除服务（与「音频队列不跨进程恢复」自洽，05 §4.9；
        // 对应 v4 AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification）
        android: { taskRemovedBehavior: 'stop' },
      });
      // 通知栏/锁屏可用命令（对应 v4 capabilities；compact 由系统自行裁剪）：
      // Play/Pause 合并为 PlayPause，Seek 覆盖进度条拖动
      TrackPlayer.setCommands({
        capabilities: [
          PlayerCommand.PlayPause,
          PlayerCommand.Next,
          PlayerCommand.Previous,
          PlayerCommand.Seek,
        ],
      });
      usePlayerStore.getState().setAudioState({ engineReady: true });
    })();
    try {
      await this.setupPromise;
    } catch (error) {
      // 失败清空允许下次重试；状态置 error（迷你条不出现），错误码归一由调用方 toast
      this.setupPromise = null;
      usePlayerStore.getState().setAudioState({ status: 'error' });
      throw new AppError('AUDIO_ENGINE_INIT_FAILED', { cause: error });
    }
  }

  /**
   * 重置队列并从 startIndex 起播——整单播放（播放全部/随机）与单曲点播的统一入口；
   * 单曲点播由调用方传单元素列表（不再自动带入所在列表）。每次调用生成新 playSessionId。
   */
  async playQueue(trackList: AudioItem[], startIndex: number): Promise<void> {
    try {
      await this.ensureSetup();
    } catch (error) {
      showToast(errorMessageOf(this.errorCodeOf(error)), 'error');
      return;
    }
    const playSessionId = newUid();
    const trackListResolved = await this.resolveTrackList(trackList, playSessionId);
    this.activePlaySessionId = playSessionId;
    this.syncAudioItemTable(trackListResolved.audioList);
    this.originalTrackIdOrder = trackListResolved.audioList.map((item) => item.id);
    // 新队列歌词缓存整体失效（队列成员可能来自不同专辑/歌单，避免跨队列陈旧引用）
    this.lyricsCache.clear();
    this.lyricsPending.clear();
    // setMediaItems：清空旧队列 + 按 startIndex 就位（v5 合并了 v4 的 reset/add/skip 三步）
    TrackPlayer.setMediaItems(trackListResolved.mediaItems, startIndex);
    await TrackPlayer.play();
    usePlayerStore.getState().setAudioState({ queueLength: trackList.length, shuffle: false });
  }

  /** 追加到队尾（专辑/歌单「加入队列」按钮）；返回实际新增曲目数（去重后）。 */
  async addToQueue(trackList: AudioItem[]): Promise<number> {
    try {
      await this.ensureSetup();
    } catch (error) {
      showToast(errorMessageOf(this.errorCodeOf(error)), 'error');
      return 0;
    }
    // 去重：以原生队列为真源，跳过已在队列中的曲目（同时过滤入参自身重复项），
    // 反复「加入队列」不会让同一首歌堆积
    const existingIds = new Set(
      TrackPlayer.getQueue()
        .map((item) => item.mediaId)
        .filter((id): id is string => id !== undefined)
    );
    const newTrackList = trackList.filter((audio) => {
      if (existingIds.has(audio.id)) {
        return false;
      }
      existingIds.add(audio.id);
      return true;
    });
    if (newTrackList.length === 0) {
      showToast(t('audio.alreadyInQueue'));
      return 0;
    }
    const queueEmpty = this.activePlaySessionId === null;
    const playSessionId = queueEmpty ? newUid() : this.activePlaySessionId;
    if (playSessionId === null) {
      return 0;
    }
    const trackListResolved = await this.resolveTrackList(newTrackList, playSessionId);
    this.activePlaySessionId = playSessionId;
    // 无条件回填映射：队列中的曲目被移除后再加入时，元数据与原序基线都要恢复
    const orderedIds = new Set(this.originalTrackIdOrder);
    trackListResolved.audioList.forEach((item) => {
      this.audioItemById.set(item.id, item);
      if (!orderedIds.has(item.id)) {
        orderedIds.add(item.id);
        this.originalTrackIdOrder.push(item.id);
      }
    });
    TrackPlayer.addMediaItems(trackListResolved.mediaItems);
    const previousLength = usePlayerStore.getState().audio.queueLength;
    usePlayerStore.getState().setAudioState({ queueLength: previousLength + newTrackList.length });
    // 队列已空时追加：追加完从队首起播（否则用户无反馈）
    if (queueEmpty) {
      TrackPlayer.skipToIndex(0);
      await TrackPlayer.play();
    }
    showCenterToast(t('audio.addedToQueue'));
    return newTrackList.length;
  }

  /**
   * 清空队列但保留当前曲（05 §4.11 改版）：移除当前曲以外的全部条目，播放不中断、
   * 迷你条不消失；队列只剩当前曲，长度镜像为 1，随机基线同步收敛。
   */
  async clearQueueKeepCurrent(): Promise<void> {
    const currentIndex = TrackPlayer.getActiveMediaItemIndex();
    const queue = TrackPlayer.getQueue();
    if (currentIndex === null || currentIndex < 0 || queue.length === 0) {
      return;
    }
    const currentId = queue[currentIndex]?.mediaId;
    // 先删当前曲之后的项，再删之前的项（前段删除不改变当前曲索引）
    if (currentIndex < queue.length - 1) {
      TrackPlayer.removeMediaItems(currentIndex + 1, queue.length);
    }
    if (currentIndex > 0) {
      TrackPlayer.removeMediaItems(0, currentIndex);
    }
    if (currentId !== undefined) {
      const currentAudio = this.audioItemById.get(currentId);
      this.audioItemById.clear();
      if (currentAudio !== undefined) {
        this.audioItemById.set(currentId, currentAudio);
      }
      // 随机基线只保留当前曲；队列仅一项时随机态无意义，复位为关
      this.originalTrackIdOrder = [currentId];
    } else {
      this.originalTrackIdOrder = [];
    }
    usePlayerStore.getState().setAudioState({ queueLength: 1, shuffle: false });
  }

  /** 队列快照（05 §4.5：队列全量仅在队列页打开时拉取；UI 不直呼 TrackPlayer，唯一入口约束） */
  async getQueueSnapshot(): Promise<AudioQueueEntry[]> {
    const queue = TrackPlayer.getQueue();
    return queue.map((item) => ({
      id: item.mediaId ?? '',
      title: item.title ?? '',
      artist: item.artist,
      album: item.albumTitle,
      coverUrl: typeof item.artworkUrl === 'string' ? item.artworkUrl : undefined,
      durationMs: item.duration !== undefined ? item.duration * 1000 : undefined,
    }));
  }

  /**
   * 相邻曲预览（迷你条左右滑显示下一首/上一首名称）：队列真源在原生侧，按当前索引取前后项。
   * 无相邻曲时对应字段缺省（滑到队首/队尾不预览也不切歌）。
   */
  async getAdjacentTrackPreviews(): Promise<{
    previous?: AdjacentTrackPreview;
    next?: AdjacentTrackPreview;
  }> {
    const index = TrackPlayer.getActiveMediaItemIndex();
    if (index === null) {
      return {};
    }
    const queue = TrackPlayer.getQueue();
    const toPreview = (item: MediaItem | undefined): AdjacentTrackPreview | undefined => {
      if (item === undefined) {
        return undefined;
      }
      const preview: AdjacentTrackPreview = { id: item.mediaId ?? '', title: item.title ?? '' };
      if (item.artist !== undefined) {
        preview.artist = item.artist;
      }
      return preview;
    };
    return { previous: toPreview(queue[index - 1]), next: toPreview(queue[index + 1]) };
  }

  /**
   * 歌词加载（M6 文档 §4.6.3）：adapter.getLyrics（404 → null）随队列当前曲目缓存，
   * 切歌回同一曲命中缓存不重复请求；歌词不进队列/通知栏，纯 UI 消费。
   */
  async loadLyrics(itemId: string): Promise<LyricLine[] | null> {
    const cached = this.lyricsCache.get(itemId);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.lyricsPending.get(itemId);
    if (pending !== undefined) {
      return pending;
    }
    const task = (async () => {
      const lines = await this.getAdapter().getLyrics(requireActiveUserId(), itemId);
      this.lyricsCache.set(itemId, lines);
      this.lyricsPending.delete(itemId);
      return lines;
    })();
    this.lyricsPending.set(itemId, task);
    return task;
  }

  async togglePlayPause(): Promise<void> {
    if (TrackPlayer.isPlaying()) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  }

  async next(): Promise<void> {
    await TrackPlayer.skipToNext();
  }

  /** 队列页点击行跳曲（MediaItemTransition 事件链完成上报交接） */
  async skipToIndex(index: number): Promise<void> {
    await TrackPlayer.skipToIndex(index);
  }

  /** 位置 > 阈值时先 seek 回当前曲开头（主流音乐 App 习惯，05 §4.5） */
  async previous(): Promise<void> {
    const progress = TrackPlayer.getProgress();
    if (progress.position * 1000 > PREVIOUS_RESTART_THRESHOLD_MS) {
      await this.seekTo(0);
      return;
    }
    await TrackPlayer.skipToPrevious();
  }

  /** 直接切上一曲（不做「位置 > 3 秒回曲头」判定；迷你条右滑用） */
  async skipToPreviousTrack(): Promise<void> {
    await TrackPlayer.skipToPrevious();
  }

  /** 拖动进度（UI 与通知栏进度条同路径）：即时上报 Progress 并重置节流计时 */
  async seekTo(positionMs: number): Promise<void> {
    await TrackPlayer.seekTo(positionMs / 1000);
    this.reporting.notifySeek(positionMs);
  }

  /** "off" | "track" | "queue" → RepeatMode.Off/One/All（store 与原生双向同步） */
  async setRepeatMode(mode: RepeatModeEnum): Promise<void> {
    await TrackPlayer.setRepeatMode(toNativeRepeatMode(mode));
    usePlayerStore.getState().setAudioState({ repeatMode: mode });
  }

  /**
   * 播放模式循环（列表循环 → 随机 → 单曲循环 → 列表循环）：NowPlaying 模式按钮与
   * 队列面板标题共用同一实现；返回切换后的模式（UI 提示文案取 PLAYBACK_MODE_META）。
   */
  async cyclePlaybackMode(): Promise<PlaybackModeEnum> {
    const audio = usePlayerStore.getState().audio;
    const mode = combinedPlaybackMode(audio.repeatMode, audio.shuffle);
    if (mode === 'queue') {
      // 列表循环 → 随机（队列重建打乱）
      await this.toggleShuffle();
      return 'shuffle';
    }
    if (mode === 'shuffle') {
      // 随机 → 单曲循环（先恢复原序，再切循环模式）
      await this.toggleShuffle();
      await this.setRepeatMode('track');
      return 'track';
    }
    // 单曲循环 → 列表循环
    await this.setRepeatMode('queue');
    return 'queue';
  }

  /**
   * 随机开：当前曲与其已播区段不动（当前曲不中断），仅对当前曲之后的待播区段做
   * Fisher-Yates 打乱（集合不变）；随机关：当前曲之后的区段按 originalTrackIdOrder
   * 恢复原序（仅 move，播放不中断）。随机后播完队列即止（不自动重洗）。
   */
  async toggleShuffle(): Promise<void> {
    const currentIndex = TrackPlayer.getActiveMediaItemIndex();
    if (currentIndex === null) {
      return;
    }
    const audio = usePlayerStore.getState().audio;
    if (!audio.shuffle) {
      // 开随机：移除当前曲之后的待播区段，打乱后按序追加（当前曲与已播区段不触碰）
      const queue = TrackPlayer.getQueue();
      const upcoming = queue.slice(currentIndex + 1);
      usePlayerStore.getState().setAudioState({ shuffle: true, queueLength: queue.length });
      if (upcoming.length === 0) {
        return;
      }
      // removeMediaItems 半开区间 [from, to)：移除 (currentIndex, length)
      TrackPlayer.removeMediaItems(currentIndex + 1, queue.length);
      TrackPlayer.addMediaItems(fisherYatesShuffle(upcoming));
      return;
    }
    // 关随机：已播区段未被随机触碰，恢复 = 当前曲之后的区段按原序 move
    const queue = TrackPlayer.getQueue();
    const currentTrackId = queue[currentIndex]?.mediaId;
    const currentPos = currentTrackId !== undefined
      ? this.originalTrackIdOrder.indexOf(currentTrackId)
      : -1;
    usePlayerStore.getState().setAudioState({ shuffle: false });
    if (currentTrackId === undefined || currentPos < 0) {
      return;
    }
    const local = [...queue];
    const postIdList = this.originalTrackIdOrder.slice(currentPos + 1);
    for (let target = currentIndex + 1; target < local.length; target += 1) {
      const targetId = postIdList[target - currentIndex - 1];
      if (targetId === undefined) {
        break;
      }
      const from = local.findIndex((item, index) => index > currentIndex && item.mediaId === targetId);
      if (from < 0 || from === target) {
        continue;
      }
      await TrackPlayer.moveMediaItem(from, target);
      const [moved] = local.splice(from, 1);
      local.splice(target, 0, moved);
    }
  }

  /**
   * 队列移除（05 §4.11）：移除当前播放曲 → 先 skip 到相邻曲（优先下一曲）再移除旧索引，
   * 播放不中断；移除其他曲直接移除（当前曲之前的项由播放器内部自动左移）。
   */
  async removeFromQueue(index: number): Promise<void> {
    const currentIndex = TrackPlayer.getActiveMediaItemIndex();
    const queueLength = usePlayerStore.getState().audio.queueLength;
    if (currentIndex === null || index < 0 || index >= queueLength) {
      return;
    }
    const queue = TrackPlayer.getQueue();
    if (index === currentIndex) {
      if (queueLength <= 1) {
        // 队列仅剩当前曲：移除即清空
        await this.stop();
        return;
      }
      // 先跳相邻曲再移除旧索引（MediaItemTransition 事件链完成上报交接）
      if (index < queueLength - 1) {
        await TrackPlayer.skipToNext();
      } else {
        await TrackPlayer.skipToPrevious();
      }
      TrackPlayer.removeMediaItem(index);
    } else {
      TrackPlayer.removeMediaItem(index);
    }
    // 原序快照同步移除（恢复随机基线与队列成员保持一致）
    const removedId = queue[index]?.mediaId;
    if (removedId !== undefined) {
      this.originalTrackIdOrder = this.originalTrackIdOrder.filter((id) => id !== removedId);
    }
    usePlayerStore.getState().setAudioState({ queueLength: queueLength - 1 });
  }

  /** 队列拖动排序（队列页 onDragEnd 映射），播放顺序即时跟随；非随机态同步原序基线 */
  async moveInQueue(from: number, to: number): Promise<void> {
    await TrackPlayer.moveMediaItem(from, to);
    if (!usePlayerStore.getState().audio.shuffle) {
      const order = [...this.originalTrackIdOrder];
      if (from >= 0 && to >= 0 && from < order.length && to < order.length) {
        const [movedId] = order.splice(from, 1);
        if (movedId !== undefined) {
          order.splice(to, 0, movedId);
        }
        this.originalTrackIdOrder = order;
      }
    }
  }

  /** 清队列 + 移除通知 + 报当前曲 Stopped（v5 原生 stop 同路径回流） */
  async stop(): Promise<void> {
    await this.reporting.stopCurrent();
    this.activeSession = null;
    this.activePlaySessionId = null;
    this.originalTrackIdOrder = [];
    this.audioItemById.clear();
    this.lyricsCache.clear();
    this.lyricsPending.clear();
    TrackPlayer.clear();
    this.reporting.endProgress();
    // resetAudio 会复位整块 audio 切片；但原生引擎仍处于已初始化状态（setupPromise 未销毁），
    // 就绪标记必须保留——否则清空队列后再点歌，音频虽入队但迷你条/NowPlaying 入口全部隐藏，
    // 表现为「点击音频没有反应」（engineReady 只在 setupPlayer 首次成功时写 true）
    const { engineReady } = usePlayerStore.getState().audio;
    usePlayerStore.getState().resetAudio();
    usePlayerStore.getState().setAudioState({ engineReady });
  }

  // —— 会话激活（AudioReportingHost 回调；新曲生效的编排核心）——

  /**
   * 新曲生效：构建/替换当前会话 + 镜像 store + 开启节流窗口 + 上报 Playing（positionMs=0）。
   * track 为 undefined 表示队列已无活跃曲（清空交接，仅摘会话）。
   */
  private async activateTrack(track: MediaItem | undefined): Promise<void> {
    if (track === undefined) {
      this.activeSession = null;
      return;
    }
    const playSessionId = this.activePlaySessionId;
    if (playSessionId === null) {
      return;
    }
    const itemId = track.mediaId ?? '';
    const audioItem = this.audioItemById.get(itemId);
    // 新曲会话（URL 已在入队时定型，直接组装会话；positionMsAtStart 恒 0）
    const session: PlaybackSession = {
      playSessionId,
      itemId,
      mediaSourceId: itemId,
      playMethod: 'Universal',
      url: typeof track.url === 'string' ? track.url : String(track.url),
      positionMsAtStart: 0,
      runTimeMs: audioItem?.runtimeMs,
      subtitleList: [],
      audioList: [],
      startedAtEpochMs: Date.now(),
    };
    this.activeSession = session;
    this.reporting.beginSession(session);
    usePlayerStore.getState().setAudioState({
      currentTrack: audioItem ?? this.audioItemFromTrack(track),
      // 清空队列/重建队列后 MediaItemTransition 可能晚于 IsPlayingChanged(true)：
      // 此时原生已在播，不能再写 buffering，否则 UI 永久停在「播放」按钮（点了没反应）
      status: TrackPlayer.isPlaying() ? 'playing' : 'buffering',
    });
    await this.reporting.reportPlayingFor(itemId, playSessionId);
  }

  // —— 内部工具 ——

  /** 批量决策：每曲 universal URL（N 条 URL 字符串，零请求；URL 入队定型，05 §4.4） */
  private async resolveTrackList(
    trackList: AudioItem[],
    playSessionId: string
  ): Promise<{ mediaItems: MediaItem[]; audioList: AudioItem[] }> {
    const mediaItems = await Promise.all(
      trackList.map(async (audio) => {
        const session = await this.resolveAudioFn(audio.id, {
          playSessionId,
          runTimeMs: audio.runtimeMs,
        });
        return toMediaItem(audio, session.url);
      })
    );
    return { mediaItems, audioList: trackList };
  }

  /** 曲目 id → AudioItem 查询表重建（playQueue 全量替换） */
  private syncAudioItemTable(audioList: AudioItem[]): void {
    this.audioItemById.clear();
    audioList.forEach((item) => {
      this.audioItemById.set(item.id, item);
    });
  }

  /** 查询表缺失时的兜底镜像（事件 item 元数据 → 最小 AudioItem） */
  private audioItemFromTrack(item: MediaItem): AudioItem {
    return {
      id: item.mediaId ?? '',
      name: item.title ?? '',
      artistName: item.artist,
      albumName: item.albumTitle,
      coverImageUrl: typeof item.artworkUrl === 'string' ? item.artworkUrl : undefined,
      runtimeMs: item.duration !== undefined ? item.duration * 1000 : undefined,
    };
  }

  private errorCodeOf(error: unknown): Parameters<typeof errorMessageOf>[0] {
    return error instanceof AppError ? error.code : 'UNKNOWN';
  }
}

/** 全局单例（事件订阅与上报与应用生命周期等长，05 §4.1） */
export const audioService = new AudioService({ getAdapter: getActiveAdapter });
