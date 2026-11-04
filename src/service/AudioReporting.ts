/**
 * 音频事件→上报接线（M5 文档 §4.5 事件表）：自 AudioService 拆出的协作类——
 * 持有 30s 节流 ProgressService（AUDIO_PROGRESS_REPORT_INTERVAL_MS 单一事实源）与
 * 「最近已知暂停态」，订阅 @rntp/player（v5）五类播放事件并完成上报编排；
 * AudioService 保留队列/模式/会话生命周期编排，经 host 接口回查会话与放行新曲激活。
 * （AGENTS.md 类长度约束的职责拆分；与 AudioService 同为模块级生命周期。）
 *
 * v5 事件模型与 v4 差异：
 * - PlaybackState（枚举）只含 Idle/Ready/Buffering/Ended/Error，Playing/Paused 拆到
 *   IsPlayingChanged（playing: boolean）——暂停/恢复上报走该事件；
 * - PlaybackActiveTrackChanged → MediaItemTransition，负载无上一曲（lastTrack），
 *   上一曲由本类自记（lastActiveItem）完成 Stopped 上报；
 * - PlaybackQueueEnded → PlaybackStateChanged(Ended)（末曲收尾）；
 * - 队列级 30s 进度事件间隔由 PlayerConfig.progressSync.intervalSeconds 配置
 *   （AudioService.ensureSetup 内设置）。
 */
import TrackPlayer, {
  Event,
  PlaybackState,
  type MediaItem,
} from '@rntp/player';

import type { PlaybackSession } from '@/adapter/model';
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import { AUDIO_PROGRESS_REPORT_INTERVAL_MS } from '@/constant/audio';
import { showToast } from '@/component/Toast';
import { errorMessageOf } from '@/infra/error';
import { ProgressService } from '@/service/ProgressService';
import { usePlayerStore } from '@/store/playerStore';

/** AudioReporting 回查宿主（AudioService 实现会话持有与镜像，本类只管事件与上报） */
export interface AudioReportingHost {
  /** adapter（上报 Playing/Progress/Stopped；注入以便单测断言调用序列） */
  getAdapter(): ServerAdapter;
  /** 当前曲会话（无活跃曲为 null） */
  getActiveSession(): PlaybackSession | null;
  /** 队列级 playSessionId（无队列为 null） */
  getPlaySessionId(): string | null;
  /**
   * 新曲生效：AudioService 构建/替换当前会话 + 镜像 store（含 audioItemById 查询表）。
   * track 为 undefined 表示队列已无活跃曲（上报链无需动作）。
   */
  activateTrack(track: MediaItem | undefined): Promise<void>;
}

export class AudioReporting {
  /** 30s 节流上报（间隔取 constant/audio 单一事实源，M5 文档 §3.2/§4.8） */
  private readonly progress: ProgressService;

  /** 最近已知是否暂停态（PlaybackProgressUpdated 事件无 paused 字段，由 IsPlayingChanged 镜像） */
  private lastKnownPaused = false;

  /** 最近已知活跃 MediaItem（v5 MediaItemTransition 不带上一曲，自记完成 Stopped 上报） */
  private lastActiveItem: MediaItem | null = null;

  /** 最近已知播放状态（Ended 后的 isPlaying=false 不重复走暂停链） */
  private lastPlaybackState: PlaybackState = PlaybackState.Idle;

  constructor(
    private readonly host: AudioReportingHost,
    nowFn: () => number = Date.now
  ) {
    this.progress = new ProgressService(nowFn, AUDIO_PROGRESS_REPORT_INTERVAL_MS);
  }

  /** 最近一次已知播放位置（切歌上报上一曲 Stopped 的 positionMs 来源，误差 ≤30s 接受） */
  getLastPositionMs(): number {
    return this.progress.getLastPositionMs();
  }

  /** 新曲会话就绪后开启节流窗口（AudioService 在 activateTrack 内调用） */
  beginSession(session: PlaybackSession): void {
    this.progress.begin(session);
  }

  /** seek（UI 与通知栏进度条同路径）：即时上报 Progress 并重置节流计时 */
  notifySeek(positionMs: number): void {
    const session = this.host.getActiveSession();
    if (session !== null) {
      this.progress.notifySeek(session, positionMs);
    }
  }

  /** 当前曲 Stopped（stop()/PlaybackError 路径；失败重试 1 次，不弹 UI） */
  async stopCurrent(): Promise<void> {
    const session = this.host.getActiveSession();
    if (session === null) {
      return;
    }
    await this.reportStoppedFor(session.itemId, this.getLastPositionMs());
  }

  /** Stopped 上报（失败重试恰好 1 次；均失败静默，服务器会话超时回收兜底） */
  async reportStoppedFor(trackId: string, positionMs: number): Promise<void> {
    const playSessionId = this.host.getPlaySessionId();
    if (playSessionId === null) {
      return;
    }
    const args = {
      itemId: trackId,
      playSessionId,
      mediaSourceId: trackId,
      positionMs,
      playMethod: 'Universal' as const,
    };
    try {
      await this.host.getAdapter().reportStopped(args);
    } catch {
      try {
        await this.host.getAdapter().reportStopped(args);
      } catch {
        // 静默（M2 同口径）
      }
    }
  }

  /** Playing 上报（新曲生效 positionMs=0；失败静默） */
  async reportPlayingFor(trackId: string, playSessionId: string): Promise<void> {
    try {
      await this.host.getAdapter().reportPlaying({
        itemId: trackId,
        playSessionId,
        mediaSourceId: trackId,
        positionMs: 0,
        playMethod: 'Universal',
      });
    } catch {
      // 静默（M2 同口径）
    }
  }

  /** 结束节流（stop()/队列播尽后停发） */
  endProgress(): void {
    this.progress.end();
  }

  // —— 事件订阅（index.ts registerPlaybackSession → attachPlaybackSession 一次性挂载；
  // 监听器返回 promise 便于单测 await 事件处理完成）——

  subscribe(): void {
    // 新曲生效（含队首首曲）：上一曲 Stopped + 新曲 Playing（05 §4.5 事件表）
    TrackPlayer.addEventListener(Event.MediaItemTransition, (event) =>
      this.handleMediaItemTransition(event)
    );
    // 播放状态：Buffering/Ended/Error 即时映射（Playing/Paused 拆在 IsPlayingChanged）
    TrackPlayer.addEventListener(Event.PlaybackStateChanged, (event) =>
      this.handlePlaybackStateChanged(event)
    );
    // 暂停/恢复即时 Progress（v5 与 v4 PlaybackState Playing/Paused 等价的事件载体）
    TrackPlayer.addEventListener(Event.IsPlayingChanged, (event) =>
      this.handleIsPlayingChanged(event)
    );
    // 原生每 30s 进度事件（熄屏/后台仍发）→ 经 ProgressService 节流去重
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      const session = this.host.getActiveSession();
      if (session === null) {
        return;
      }
      this.progress.notifyProgress(session, event.position * 1000, this.lastKnownPaused);
    });
    // 解码失败/URL 403 等：状态置 error + 当前曲 Stopped（不自动跳下一曲，避免连环失败）
    TrackPlayer.addEventListener(Event.PlaybackError, (event) => this.handlePlaybackError(event));
  }

  private async handleMediaItemTransition(event: { item: MediaItem | null | undefined }): Promise<void> {
    const previous = this.lastActiveItem;
    // 清空队列/stop() 时原生事件可能带 undefined（类型声明只写 null），必须归一化：
    // 否则下一次切歌时 previous 为 undefined，`previous.mediaId` 抛 TypeError，
    // 首次点歌事件链中断（表现为清空后第一次点音频没反应、第二次才正常）
    this.lastActiveItem = event.item ?? null;
    const next = event.item ?? undefined;
    // 上一曲收尾：Stopped（positionMs 取节流服务记录的最近位置）；
    // repeat-one 循环（同曲）不报 Stopped（曲未变，会话由 activateTrack 重建）
    if (
      previous !== null &&
      previous.mediaId !== undefined &&
      (next === undefined || next.mediaId !== previous.mediaId)
    ) {
      await this.reportStoppedFor(previous.mediaId, this.getLastPositionMs());
    }
    // 新曲激活与会话交接（会话构建/镜像/Playing 上报由 AudioService 编排）
    await this.host.activateTrack(next);
  }

  private async handlePlaybackStateChanged(event: { state: PlaybackState }): Promise<void> {
    this.lastPlaybackState = event.state;
    const store = usePlayerStore.getState();
    if (event.state === PlaybackState.Buffering) {
      store.setAudioState({ status: 'buffering' });
      return;
    }
    if (event.state === PlaybackState.Error) {
      store.setAudioState({ status: 'error' });
      return;
    }
    if (event.state === PlaybackState.Ended) {
      await this.handleQueueEnded();
    }
    // Idle/Ready：无 UI 语义（与 v4 None/Ready 不处理同口径）
  }

  private async handleIsPlayingChanged(event: { playing: boolean }): Promise<void> {
    // 末曲播完（Ended）：Paused 链路由 handleQueueEnded 承担（Stopped + endProgress），不重复上报
    if (!event.playing && this.lastPlaybackState === PlaybackState.Ended) {
      return;
    }
    const store = usePlayerStore.getState();
    if (event.playing) {
      this.lastKnownPaused = false;
      store.setAudioState({ status: 'playing' });
      const session = this.host.getActiveSession();
      if (session !== null) {
        this.progress.notifyResumed(session, this.getLastPositionMs());
      }
      return;
    }
    this.lastKnownPaused = true;
    store.setAudioState({ status: 'paused' });
    const session = this.host.getActiveSession();
    if (session !== null) {
      this.progress.notifyPaused(session, this.getLastPositionMs());
    }
  }

  private async handleQueueEnded(): Promise<void> {
    // 末曲收尾（列表循环关闭时播完）；位置取节流服务最近已知值（v5 无事件级 position）
    const session = this.host.getActiveSession();
    if (session !== null) {
      await this.reportStoppedFor(session.itemId, this.getLastPositionMs());
    }
    this.progress.end();
    usePlayerStore.getState().setAudioState({ status: 'paused' });
  }

  private async handlePlaybackError(event: { code: string; message: string }): Promise<void> {
    console.warn(`[AudioReporting] 播放错误：${event.code} ${event.message}`);
    await this.stopCurrent();
    usePlayerStore.getState().setAudioState({ status: 'error' });
    showToast(errorMessageOf('UNKNOWN'), 'error');
  }
}
