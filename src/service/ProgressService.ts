/**
 * 进度上报服务（M2 文档 §4.5；设计文档 §7.3；M5 文档 §4.5 增量；M6 文档 §4.5 离线入队分支）：
 * 独立节流上报。播放中每节流间隔上报 Progress；暂停/恢复/seek/出错即时上报；
 * 与 PlaybackService 并列（设计文档 §4）。
 * M5 增量：构造函数 intervalMs 注入（音频档 30s，见设计文档 §7.5，视频档 10s 默认值不破坏）
 * + lastPositionMs 记录（切歌 Stopped 的 positionMs 取 getLastPositionMs()，误差 ≤ 节流间隔可接受）。
 * M6 增量（06 文档 §4.5）：上报失败且「错误码为网络类 且 netinfo 判定离线」→
 * OfflineProgressService.enqueue 落库后按原语义继续（Progress 静默）；其他错误维持 M2 策略。
 * 本地会话与在线串流会话走同一条失败分支（一条代码路径覆盖两种场景）。
 */
import type { PlaybackSession } from '@/adapter/model';
import { PROGRESS_REPORT_INTERVAL_MS } from '@/constant/playback';
import { enqueueOnReportFailure } from '@/service/OfflineProgressService';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

export class ProgressService {
  /** 上次节流上报时刻（begin 后一个间隔内不上报） */
  private lastReportAt: number = 0;

  /** notifyError/end 后停止节流上报 */
  private stopped: boolean = false;

  /** 时钟可注入（单测假时钟） */
  private readonly nowFn: () => number;

  /** 节流间隔（毫秒）：视频档默认 10s；音频档由 AudioService 注入 30s（M5 文档 §3.2） */
  private readonly intervalMs: number;

  /** 最近一次已知播放位置（毫秒）：notifyProgress/即时上报均刷新；begin 前为 0 */
  private lastPositionMs: number = 0;

  constructor(nowFn: () => number = Date.now, intervalMs: number = PROGRESS_REPORT_INTERVAL_MS) {
    this.nowFn = nowFn;
    this.intervalMs = intervalMs;
  }

  /** 最近一次已知播放位置（切歌上报上一曲 Stopped 的 positionMs 来源，M5 文档 §4.5） */
  getLastPositionMs(): number {
    return this.lastPositionMs;
  }

  /** 开始会话节流（重置计时：begin 后满一个间隔才第一次 Progress） */
  begin(_session: PlaybackSession): void {
    this.lastReportAt = this.nowFn();
    this.stopped = false;
  }

  /**
   * 播放器 onProgress 高频回调（约 500ms 一次）：距上次 ≥ 节流间隔才真正上报。
   * 上报失败：离线入队（M6 §4.5），否则静默（下个节流窗口自然再报，02 §4.5）。
   */
  notifyProgress(session: PlaybackSession, positionMs: number, isPaused: boolean): void {
    if (this.stopped) {
      return;
    }
    const now = this.nowFn();
    if (now - this.lastReportAt < this.intervalMs) {
      return;
    }
    this.lastReportAt = now;
    this.lastPositionMs = positionMs;
    this.report(session, positionMs, isPaused);
  }

  /** 暂停：即时上报（不受节流限制）并重置节流计时 */
  notifyPaused(session: PlaybackSession, positionMs: number): void {
    this.reportNow(session, positionMs, true);
  }

  /** 恢复：即时上报并重置节流计时 */
  notifyResumed(session: PlaybackSession, positionMs: number): void {
    this.reportNow(session, positionMs, false);
  }

  /** seek：即时上报并重置节流计时 */
  notifySeek(session: PlaybackSession, positionMs: number): void {
    this.reportNow(session, positionMs, false);
  }

  /** 出错：即时上报后停止节流（错误态内不再上报） */
  notifyError(session: PlaybackSession, positionMs: number): void {
    this.reportNow(session, positionMs, false);
    this.stopped = true;
  }

  /** 会话结束（与 PlaybackService.finish 配合的退出点；此后停发） */
  end(): void {
    this.stopped = true;
  }

  /** 即时上报：不受节流限制，并重置节流计时 */
  private reportNow(session: PlaybackSession, positionMs: number, isPaused: boolean): void {
    if (this.stopped) {
      return;
    }
    this.lastReportAt = this.nowFn();
    this.lastPositionMs = positionMs;
    this.report(session, positionMs, isPaused);
  }

  /** 统一上报出口：失败按「网络类 + 离线」双条件入队，否则静默（02 §4.5 / 06 §4.5） */
  private report(session: PlaybackSession, positionMs: number, isPaused: boolean): void {
    void getActiveAdapter()
      .reportProgress({
        itemId: session.itemId,
        playSessionId: session.playSessionId,
        mediaSourceId: session.mediaSourceId,
        positionMs,
        isPaused,
        playMethod: session.playMethod,
      })
      .catch((err: unknown) => {
        // 离线入队（双条件内判；非网络类/在线失败维持静默，06 §4.5）
        const context = offlineEventContext(session);
        if (context !== null) {
          void enqueueOnReportFailure(err, {
            ...context,
            eventType: 'Progress',
            positionMs,
            isPaused,
          });
        }
      });
  }
}

/** 入队事件上下文（serverId/userId 取当前活跃账号；缺失属时序错误，入队降级跳过） */
function offlineEventContext(session: PlaybackSession): {
  serverId: string;
  userId: string;
  itemId: string;
  playSessionId: string;
  mediaSourceId: string;
} | null {
  const active = useAccountStore.getState().active;
  if (active === null) {
    // 理论不可达（播放必有活跃账号）；无活跃账号无法归属账号域，跳过入队
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
