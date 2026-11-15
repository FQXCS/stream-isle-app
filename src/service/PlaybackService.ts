/**
 * 播放服务（M2 文档 §4.5 + M3 文档 §4.6）：播放会话生命周期
 * （决策/Playing/Stopped 收尾/会话重启编排/分辨率·字幕·音轨切换）。
 * 节流归 ProgressService（两者并列，见设计文档 §4）。
 * 会话重启套路（M3 §4.6.1）：快照 positionMs → 先报 Stopped（不做 markPlayed 兜底）→
 * 转码则 DELETE ActiveEncodings → resolve 新会话（startPositionMs=快照，音轨/烧录态保持）→
 * 选中态回填；PlayerPage 以新会话重载 Video 后 begin。
 */
import type {
  AudioTrack,
  PlaybackSession,
  ResolvePlaybackOpts,
  SubtitleTrack,
} from '@/adapter/model';
import type { ResolutionTierKey } from '@/constant/resolution';
import { AUDIO_MAX_STREAMING_BITRATE_BPS } from '@/constant/bitrate';
import {
  AUDIO_TRACK_RESTART_NOTICE,
  RESOLUTION_RESTART_NOTICE,
  BURN_IN_RESTART_NOTICE,
  RESTART_RESOLVE_RETRY_DELAY_MS,
  STOPPED_RETRY_DELAY_MS,
} from '@/constant/playback';
import { fetchDecoderCaps } from '@/infra/mediaCaps';
import { t } from '@/i18n';
import { enqueueOnReportFailure, offlineProgressService } from '@/service/OfflineProgressService';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { shouldForceMarkPlayed, type PlaybackEndReason } from '@/util/resume';
import { newUid } from '@/util/uuid';

export type { PlaybackEndReason };

/** resolve 入参（M3）：业务参数透传 adapter；profileInputs 由本服务内部组装（M3 §4.6.2） */
export type PlaybackResolveOptions = Omit<ResolvePlaybackOpts, 'profileInputs'>;

/** 会话重启意图（M3 §4.6.1）：overrides 为本次重启的业务参数；subtitleTarget 为重启后字幕选中态 */
interface RestartIntent {
  overrides: Partial<PlaybackResolveOptions>;
  /** 目标轨 streamIndex（烧录/文本）、null=关闭、"keep"=沿用 */
  subtitleTarget: number | null | 'keep';
}

function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 PlaybackService');
  }
  return active.userId;
}

/** 入队事件上下文（离线补报归属；无活跃账号返回 null 跳过入队） */
function offlineContextOf(session: PlaybackSession): {
  serverId: string;
  userId: string;
  itemId: string;
  playSessionId: string;
  mediaSourceId: string;
} | null {
  const active = useAccountStore.getState().active;
  if (active === null) {
    return null;
  }
  return {
    serverId: active.serverId,
    userId: active.userId,
    itemId: session.itemId,
    playSessionId: session.playSessionId,
    mediaSourceId: session.mediaSourceId,
  };
}

/** 延迟（Stopped 失败重试用；独立小函数便于单测 fake timers） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class PlaybackService {
  /**
   * 播放决策（M3 扩展）：组装 profileInputs（mediaCaps 缓存 caps + settingsStore 开关/档位）→
   * adapter.resolvePlayback → 包装为会话。不可播放抛 PLAYBACK_UNSUPPORTED（详情页就地提示）。
   * 防御式治理（M3 §4.6.2）：resolve 前若 playerStore 存在未收尾旧会话，先静默执行
   * Stopped + DELETE（双保险，覆盖「换集」场景）；会话重启路径经 resolveInternal 不重复执行。
   */
  async resolve(itemId: string, opts?: PlaybackResolveOptions): Promise<PlaybackSession> {
    await this.teardownStaleSession();
    return this.resolveInternal(itemId, opts);
  }

  /** 纯 resolve（无防御收尾）：会话重启路径专用（重启时序已手工执行第 1–3 步，避免重复上报） */
  private async resolveInternal(
    itemId: string,
    opts?: PlaybackResolveOptions
  ): Promise<PlaybackSession> {
    const adapter = getActiveAdapter();
    const settings = useSettingsStore.getState();
    const source = await adapter.resolvePlayback(requireUserId(), itemId, {
      mediaSourceId: opts?.mediaSourceId,
      startPositionMs: opts?.startPositionMs,
      maxResolutionTier: opts?.maxResolutionTier ?? settings.maxResolutionTier,
      audioStreamIndex: opts?.audioStreamIndex,
      subtitleStreamIndex: opts?.subtitleStreamIndex,
      profileInputs: {
        allowHevcDirectPlay: settings.allowHevcDirectPlay,
        decoderCaps: await fetchDecoderCaps(),
      },
    });
    return { ...source, startedAtEpochMs: Date.now() };
  }

  /**
   * 音频播放决策（M5 文档 §4.4；设计文档 §8.4）：不做三选一判定，统一 universal 端点——
   * 服务器直连则 302 原流、否则实时转 AAC，对队列逻辑透明。不调 PlaybackInfo、不带 DeviceProfile。
   * playSessionId 缺省内部生成；runTimeMs 由 AudioService 随曲目传入（仅会话元数据）。
   * track.url 在入队时定型：播放中切分辨率档位不影响当前队列，下次入队生效（无会话内切档）。
   */
  async resolveAudio(
    itemId: string,
    opts?: { playSessionId?: string; runTimeMs?: number }
  ): Promise<PlaybackSession> {
    const adapter = getActiveAdapter();
    const playSessionId = opts?.playSessionId ?? newUid();
    const url = adapter.buildAudioUniversalUrl(itemId, playSessionId, AUDIO_MAX_STREAMING_BITRATE_BPS);
    return {
      playSessionId,
      itemId,
      // universal 在服务器内解析源，客户端以条目 ID 标识 mediaSourceId（M5 文档 §4.4）
      mediaSourceId: itemId,
      playMethod: 'Universal',
      url,
      // 音频不做断点续播，恒从 0 起（M5 文档 §4.4）
      positionMsAtStart: 0,
      runTimeMs: opts?.runTimeMs,
      subtitleList: [],
      audioList: [],
      startedAtEpochMs: Date.now(),
    };
  }

  /**
   * 防御式收尾（M3 §4.6.2）：store 中存在未收尾旧会话时，静默按重启套路第 1–3 步清理
   * （Stopped + 转码 DELETE）；不触发 markPlayed 兜底。正常路径 finish 已先行清理，此处双保险。
   */
  private async teardownStaleSession(): Promise<void> {
    const stale = usePlayerStore.getState().session;
    if (stale === null) {
      return;
    }
    const positionMs = usePlayerStore.getState().positionMs;
    await this.reportStoppedQuietly(stale, positionMs);
    if (stale.playMethod === 'Transcode') {
      // 清理幂等吞错（双保险：adapter 骨架内已吞，防御收尾不得阻塞 resolve）
      try {
        await getActiveAdapter().stopTranscodingSession(stale.playSessionId);
      } catch {
        // 静默
      }
    }
    // 旧会话已收尾：从 store 摘除，防重复清理
    if (usePlayerStore.getState().session?.playSessionId === stale.playSessionId) {
      usePlayerStore.getState().setSession(null);
    }
  }

  /** 视频加载成功后调用：上报 Playing（positionMs 为当前实际起点）；失败离线入队（M6 §4.5） */
  async begin(session: PlaybackSession, positionMs: number): Promise<void> {
    const adapter = getActiveAdapter();
    try {
      await adapter.reportPlaying({
        itemId: session.itemId,
        playSessionId: session.playSessionId,
        mediaSourceId: session.mediaSourceId,
        positionMs,
        playMethod: session.playMethod,
      });
    } catch (err) {
      // 离线入队（双条件内判；在线失败维持静默，M6 §4.5）
      const context = offlineContextOf(session);
      if (context !== null) {
        await enqueueOnReportFailure(err, { ...context, eventType: 'Playing', positionMs });
        return;
      }
      throw err;
    }
  }

  /**
   * 收尾：报 Stopped（失败重试 1 次，延迟 STOPPED_RETRY_DELAY_MS）+ 兜底标记已看
   * （shouldForceMarkPlayed：natural_end 必兜底，user_exit/error 需 ≥95%）+
   * M3 会话治理（M3 §4.6.3）：转码会话追加 DELETE ActiveEncodings（幂等吞错）。
   * 上报/标记失败均不弹 UI（M2 §4.5 上报失败策略）。
   */
  async finish(
    session: PlaybackSession,
    positionMs: number,
    reason: PlaybackEndReason
  ): Promise<void> {
    const adapter = getActiveAdapter();
    const context = offlineContextOf(session);
    const reportArgs = {
      itemId: session.itemId,
      playSessionId: session.playSessionId,
      mediaSourceId: session.mediaSourceId,
      positionMs,
      playMethod: session.playMethod,
    };
    try {
      await adapter.reportStopped(reportArgs);
    } catch (firstError) {
      // Stopped 失败重试恰好 1 次（§6.1 单测断言点）；再失败按离线入队（M6 §4.5）或静默
      await delay(STOPPED_RETRY_DELAY_MS);
      try {
        await adapter.reportStopped(reportArgs);
      } catch (retryError) {
        if (context !== null) {
          await enqueueOnReportFailure(retryError, { ...context, eventType: 'Stopped', positionMs });
        }
        // 在线失败仍静默：下个入口（重进详情读 UserData）不依赖本次上报
        void firstError;
      }
    }
    if (shouldForceMarkPlayed(positionMs, session.runTimeMs, reason)) {
      try {
        await adapter.markPlayed(requireUserId(), session.itemId);
      } catch (err) {
        // 兜底标记失败：离线入队 MarkPlayed（补报在该会话 Stopped 之后执行，M6 §4.5 已看兜底离线链路）
        if (context !== null) {
          await enqueueOnReportFailure(err, {
            ...context,
            eventType: 'MarkPlayed',
            positionMs,
          });
        }
        // 在线失败静默（不阻塞返回详情页）
      }
      // 本地已看态同步（M6 §4.5：≥95%/自然播完兜底判定成立即写快照，下载页/离线续播消费）
      if (context !== null) {
        await offlineProgressService.markLocalPlayed(context.serverId, session.itemId);
      }
    }
    // 本地断点收口：finish 位置写快照（离线续播判定消费，M6 §4.4.1 user_position_ms）
    if (context !== null) {
      await offlineProgressService.syncLocalPosition(context.serverId, session.itemId, positionMs);
    }
    // M3 会话治理：转码会话退出/播完后停服务器转码（幂等吞错；直连无会话可停）。
    // adapter 骨架内部已吞错，此处再兜一层：finish 契约上永不因清理失败抛出（M3 §4.11）
    if (session.playMethod === 'Transcode') {
      try {
        await adapter.stopTranscodingSession(session.playSessionId);
      } catch {
        // 吞错仅记日志；残留会话由服务器播放会话超时回收
        console.warn('[PlaybackService] 停止转码会话失败（幂等忽略）');
      }
    }
  }

  /**
   * 转码分辨率切换（M3 §4.6.2）：仅重启会话，不读写 settingsStore——持久化由调用方负责
   * （ResolutionMenu 手动切换先 setMaxResolutionTier 再调用；自动降档不落盘，两路径不得混淆）。
   * 直连会话返回 null（不重启；页面提示「直连播放不受分辨率限制」）。
   */
  async switchResolution(
    session: PlaybackSession,
    tier: ResolutionTierKey
  ): Promise<PlaybackSession | null> {
    if (session.playMethod !== 'Transcode') {
      return null;
    }
    usePlayerStore.getState().beginRestart(t(RESOLUTION_RESTART_NOTICE));
    return this.restartSession(session, {
      overrides: { maxResolutionTier: tier },
      subtitleTarget: 'keep',
    });
  }

  /**
   * 字幕切换（M3 §4.6.2）。返回 null = 纯客户端切换（页面直接更新 selectedTextTrack，不重启）；
   * 当前激活轨或目标轨任一为烧录轨 → 重启会话（服务器把字幕烧进画面/停止烧录），从原进度恢复。
   */
  async switchSubtitle(
    session: PlaybackSession,
    track: SubtitleTrack | null
  ): Promise<PlaybackSession | null> {
    const activeIndex = usePlayerStore.getState().activeSubtitleStreamIndex;
    const activeTrack = session.subtitleList.find((item) => item.streamIndex === activeIndex);
    const needRestart = Boolean(activeTrack?.burnIn) || Boolean(track?.burnIn);
    if (!needRestart) {
      // 双方都非烧录（含关闭）：纯客户端切换
      usePlayerStore.getState().setActiveSubtitle(track ? track.streamIndex : null);
      return null;
    }
    usePlayerStore.getState().beginRestart(t(BURN_IN_RESTART_NOTICE));
    return this.restartSession(session, {
      // 进烧录带目标轨；出烧录（切回文本/关闭）显式不带（undefined 语义必须可区分，见 restartSession）
      overrides: { subtitleStreamIndex: track?.burnIn ? track.streamIndex : undefined },
      subtitleTarget: track ? track.streamIndex : null,
    });
  }

  /**
   * 音轨切换（M3 §4.6.2；§8 开放问题 2 增强）：直连返回 null（ExoPlayer selectedAudioTrack
   * 即时生效，页面处理）；转码流内通常只含服务器所转那一条音轨，切换经会话重启生效
   * （重启带 AudioStreamIndex 指定服务器转哪条）。
   */
  async switchAudioTrack(
    session: PlaybackSession,
    track: AudioTrack
  ): Promise<PlaybackSession | null> {
    if (session.playMethod !== 'Transcode') {
      return null;
    }
    usePlayerStore.getState().beginRestart(t(AUDIO_TRACK_RESTART_NOTICE));
    return this.restartSession(session, {
      overrides: { audioStreamIndex: track.streamIndex },
      subtitleTarget: 'keep',
    });
  }

  /**
   * 会话重启套路（M3 §4.6.1 顺序保证，单测断言）：
   * 1. positionMs 快照 → 2. 先报 Stopped（不做 markPlayed 兜底，重启不是「看完」）→
   * 3. 旧会话为转码时 DELETE ActiveEncodings（幂等吞错）→ 4. resolve 新会话（startPositionMs=
   * 快照；音轨保持：未显式给时取当前选中轨，避免重启重置用户已切音轨；烧录保持：未显式
   * 给字幕参数且当前激活为烧录轨时续烧该轨）→ 5. setSession + 选中态回填（不重放自动选轨）。
   * resolve 失败用旧参数自动重试 1 次，再失败向上抛（M3 §4.11：页面 finish 收尾退出）。
   * 私有方法：重启编排由 PlayerPage 执行（页面薄编排、逻辑在服务，M2 模式）。
   */
  private async restartSession(
    oldSession: PlaybackSession,
    intent: RestartIntent
  ): Promise<PlaybackSession> {
    const playerState = usePlayerStore.getState();
    // 1. 快照（先取，后续 store 变更不影响）：首帧 onLoad 前（status=loading）进度恒为 0，
    //    此时沿用旧会话起始点——蜂窝自动降档会在起播阶段触发重启，不能用 0 抹掉续播起点
    const positionMs =
      playerState.status === 'loading' ? oldSession.positionMsAtStart : playerState.positionMs;
    // 2. 先报 Stopped（M3 §8.3；静默吞错）
    await this.reportStoppedQuietly(oldSession, positionMs);
    // 3. 转码会话停服务器转码（幂等吞错，M3 §4.5.3；失败不阻塞重启）
    if (oldSession.playMethod === 'Transcode') {
      try {
        await getActiveAdapter().stopTranscodingSession(oldSession.playSessionId);
      } catch {
        // 吞错仅记日志（adapter 骨架内已吞，此为双保险）
        console.warn('[PlaybackService] 重启路径停止转码会话失败（幂等忽略）');
      }
    }
    // 4. resolve 新会话：音轨保持 + 烧录保持
    const overrides = intent.overrides;
    const activeSubtitleStreamIndex = playerState.activeSubtitleStreamIndex;
    const activeSubtitleTrack = oldSession.subtitleList.find(
      (item) => item.streamIndex === activeSubtitleStreamIndex
    );
    // 字幕参数：overrides 显式给出（'subtitleStreamIndex' in overrides，含显式 undefined=不烧录）
    // 则用之；否则烧录保持——当前激活轨为烧录轨时续烧该轨，防止分辨率/音轨/蜂窝重启丢烧录状态
    const subtitleStreamIndex = 'subtitleStreamIndex' in overrides
      ? overrides.subtitleStreamIndex
      : activeSubtitleTrack?.burnIn
        ? activeSubtitleTrack.streamIndex
        : undefined;
    const audioStreamIndex =
      overrides.audioStreamIndex ?? playerState.activeAudioStreamIndex ?? undefined;
    // 分辨率保持：overrides 未显式给 maxResolutionTier 时沿用旧会话生效档位——蜂窝自动降档态
    // （session.maxResolutionTier=720p ≠ 用户档位）下的字幕/音轨重启不得抬升回用户档位
    // （M3 §4.9 持续语义）；直连旧会话（undefined）回落 settingsStore 用户档位，语义不变
    const maxResolutionTier = 'maxResolutionTier' in overrides
      ? overrides.maxResolutionTier
      : oldSession.maxResolutionTier;
    const resolveOpts: PlaybackResolveOptions = {
      startPositionMs: positionMs,
      ...overrides,
      maxResolutionTier,
      audioStreamIndex,
      subtitleStreamIndex,
    };
    let newSession: PlaybackSession;
    try {
      newSession = await this.resolveInternal(oldSession.itemId, resolveOpts);
    } catch (firstError) {
      // M3 §4.11：旧参数自动重试 1 次（网络抖动）；再失败向上抛，旧会话已终止不可续用
      await delay(RESTART_RESOLVE_RETRY_DELAY_MS);
      try {
        newSession = await this.resolveInternal(oldSession.itemId, resolveOpts);
      } catch {
        throw firstError;
      }
    }
    // 5. setSession（不重置选中态）+ 选中态回填（不重放 §4.8.3 自动选轨）；
    // name 保留（控制层「标题 · S1E2 集名」为 M2 已交付行为，重启换源不得清空标题）
    const store = usePlayerStore.getState();
    store.setSession({ ...newSession, name: oldSession.name });
    if (intent.subtitleTarget === 'keep') {
      // 沿用：不动作（setSession 未重置 activeSubtitleStreamIndex）
    } else {
      store.setActiveSubtitle(intent.subtitleTarget);
    }
    // 音轨回填：新会话 audioList 中 streamIndex === 所传 audioStreamIndex 的轨（转码单轨即请求轨）；
    // 匹配不到（直连/未指定/服务器未含）沿用旧值
    if (audioStreamIndex !== undefined) {
      const matched = newSession.audioList.find((item) => item.streamIndex === audioStreamIndex);
      if (matched) {
        store.setActiveAudio(matched.streamIndex);
      }
    }
    return newSession;
  }

  /** 静默上报 Stopped（重启/防御收尾路径：失败吞错，无重试、无 markPlayed 兜底） */
  private async reportStoppedQuietly(session: PlaybackSession, positionMs: number): Promise<void> {
    try {
      await getActiveAdapter().reportStopped({
        itemId: session.itemId,
        playSessionId: session.playSessionId,
        mediaSourceId: session.mediaSourceId,
        positionMs,
        playMethod: session.playMethod,
      });
    } catch {
      // 静默（M3 §4.6.1 第 2 步；§4.11 清理失败不阻塞）
    }
  }

  /**
   * 自动连播下一集（M4 文档 §4.4；设计文档 §7.2）：natural_end 收尾完成后的集数场景分支——
   * adapter.getNextUp 取下一集（按当前会话 seriesId 匹配并排除当前集，集数场景）→ 复用 resolveInternal
   * 决策换源（进度从 0 起）。调用前提：finish() 已对旧会话完成
   * Stopped/兜底标记/转码 DELETE（页面时序保证）；无下一集或 resolve 失败返回 null，
   * 页面按正常播完退出处理。不做「自动连播」开关（设计文档未定义，M4 §4.4）。
   */
  async playNextEpisode(session: PlaybackSession): Promise<PlaybackSession | null> {
    // seriesId 缺失（会话未携带剧集上下文）不连播：NextUp 首项可能是任意剧集的下一集，
    // 宁可不连播也不跨剧跳集（M4 §4.4 连播限「当前剧集的下一集」）
    if (session.seriesId === undefined) {
      return null;
    }
    const adapter = getActiveAdapter();
    const upNextList = await adapter.getNextUp(requireUserId());
    // NextUp 返回各剧的下一集：按当前剧集 seriesId 匹配（服务器未过滤时防跨剧跳集）；
    // 排除刚播完的当前集——已看态滞后（如 markPlayed 失败离线入队）时 NextUp 可能仍返回
    // 当前集，不排除会把它当下一集从 0 重播（表现为「播完从头开始」）
    const nextItem = upNextList.find(
      (item) =>
        item.type === 'Episode' &&
        item.seriesId === session.seriesId &&
        item.id !== session.itemId
    );
    if (nextItem === undefined) {
      return null;
    }
    // 决策复用 M3 resolveInternal（profileInputs 组装 + 会话包装）；进度从 0 起。
    // 连播判定字段随新会话下传（itemType/seriesId），保证第二集播完仍可继续连播；
    // 控制层标题：连播场景仅有集条目（无剧名/季号上下文），按「第 N 集 集名」拼装
    const source = await this.resolveInternal(nextItem.id, { startPositionMs: 0 });
    return {
      ...source,
      name: t('player.episodeTitle', { index: nextItem.indexNumber, name: nextItem.name }),
      itemType: 'Episode',
      seriesId: nextItem.seriesId,
    };
  }
}

/** 全局单例 */
export const playbackService = new PlaybackService();
