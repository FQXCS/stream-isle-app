/**
 * 播放器状态 store（M2 文档 §4.6 + M3 文档 §4.7.1；M5 文档 §4.7 增量 audio 切片）：
 * 播放会话 + 播放器 UI 状态。不持久化（无 persist 包装）：播放会话不进 MMKV——
 * 遵循「浏览数据不持久化」（设计文档 §9），杀进程后靠服务器 UserData.PlaybackPositionTicks 恢复断点。
 * M3 增量：字幕/音轨选中态 + 会话重启状态（驱动 SessionRestartOverlay 与切换互斥）。
 * M5 增量：audio 切片（引擎/状态/当前曲/队列长度/循环模式/随机）——队列真源在 track-player
 * 原生侧，store 只镜像 UI 需要的少量状态；播放位置不进 store（迷你条与 NowPlaying 各自
 * useProgress 订阅，避免每秒 store 写入引发全局重渲染，05 文档 §4.7）。
 */
import { create } from 'zustand';

import type { AudioItem, PlaybackSession, RepeatModeEnum } from '@/adapter/model';
import { DEFAULT_REPEAT_MODE } from '@/constant/audio';
import type { VideoAspectKey } from '@/constant/playback';

/** 播放器生命周期状态（02 §4.12 状态机） */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/** 音频引擎生命周期状态（05 文档 §4.7；idle=无队列，迷你条不显示） */
export type AudioStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'error';

/** audio 切片（不持久化，与 M2 视频字段同 store 分区） */
interface AudioPlayerState {
  /** 引擎 ensureSetup 成功后 true（失败置 audio.status=error，迷你条不出现） */
  engineReady: boolean;
  status: AudioStatus;
  /** 当前曲（镜像 PlaybackActiveTrackChanged） */
  currentTrack: AudioItem | null;
  /** 队列长度（镜像 add/remove；不存全量队列） */
  queueLength: number;
  /** 循环模式（默认列表循环） */
  repeatMode: RepeatModeEnum;
  shuffle: boolean;
}

/** audio 切片初始值（resetAudio 复用同一出处） */
function initialAudioState(): AudioPlayerState {
  return {
    engineReady: false,
    status: 'idle',
    currentTrack: null,
    queueLength: 0,
    repeatMode: DEFAULT_REPEAT_MODE,
    shuffle: false,
  };
}

interface PlayerStore {
  /** 当前会话（进页 setSession，出页 reset） */
  session: PlaybackSession | null;
  status: PlayerStatus;
  /** onProgress 驱动（500ms 级），UI 进度条消费 */
  positionMs: number;
  /** onProgress.playableDuration */
  bufferedMs: number;
  durationMs: number;
  /** 锁屏：屏蔽全部手势与控制层，单击仅呼出解锁按钮 */
  isLocked: boolean;
  /** 控制层显隐（无操作 CONTROLS_AUTO_HIDE_MS 自动隐藏） */
  controlsVisible: boolean;
  /** 播放倍速（react-native-video rate；出页 reset 归 1） */
  playbackSpeed: number;
  /** 屏幕宽高比（设置抽屉视频页；出页 reset 归 default） */
  videoAspect: VideoAspectKey;
  /**
   * 激活字幕轨 streamIndex；null=未开字幕。烧录轨激活时为其 streamIndex（切出判断依据）。
   * selectedTextTrack 由播放页据此派生（03 §4.8.2）
   */
  activeSubtitleStreamIndex: number | null;
  /** 激活音轨 streamIndex；首次起播 setSession 时初始化为服务器默认轨（isDefault）或第一条 */
  activeAudioStreamIndex: number | null;
  /** 会话重启中：驱动 SessionRestartOverlay；重启中忽略重复切换与 netinfo 触发 */
  isRestartingSession: boolean;
  /** 重启浮层文案（BURN_IN_RESTART_NOTICE / RESOLUTION_RESTART_NOTICE 等） */
  restartNotice: string | null;
  /** M5 audio 切片（队列真源在 track-player 原生侧，此处仅镜像 UI 状态） */
  audio: AudioPlayerState;
  /**
   * 设置会话。resetTrackSelection=true（仅首次起播——详情页 navigate 进入的那次）时重置
   * 字幕/音轨选中态与重启状态（字幕按 03 §4.8.3 由页面自动选轨，音轨取服务器默认轨或第一条）；
   * 会话重启走 03 §4.6.1 第 5 步选中态回填，不经此重置，防止丢用户选择
   */
  setSession(session: PlaybackSession | null, opts?: { resetTrackSelection?: boolean }): void;
  setStatus(status: PlayerStatus): void;
  updateProgress(positionMs: number, bufferedMs: number, durationMs: number): void;
  setLocked(locked: boolean): void;
  /** 控制层显隐切换（单击手势消费） */
  toggleControls(): void;
  /** 控制层显隐直接设置（手势拖动中强制显示、自动隐藏定时器消费） */
  setControlsVisible(visible: boolean): void;
  /** 设置播放倍速 */
  setPlaybackSpeed(speed: number): void;
  /** 设置屏幕宽高比 */
  setVideoAspect(aspect: VideoAspectKey): void;
  /** 设置激活字幕轨（null=关闭） */
  setActiveSubtitle(streamIndex: number | null): void;
  /** 设置激活音轨 */
  setActiveAudio(streamIndex: number | null): void;
  /** 进入会话重启态（isRestartingSession=true + 浮层文案） */
  beginRestart(notice: string): void;
  /** 结束会话重启态 */
  endRestart(): void;
  /** audio 切片整体替换（AudioService 镜像写入；05 文档 §4.7 actions） */
  setAudioState(patch: Partial<AudioPlayerState>): void;
  /** audio 切片复位（stop() 后调用；引擎保持已初始化态） */
  resetAudio(): void;
  /** 出页清空（会话不持久化） */
  reset(): void;
}

/** 音轨初始选中：服务器默认轨（isDefault）优先，否则第一条（03 §4.7.1） */
function initialAudioIndex(session: PlaybackSession | null): number | null {
  const audioList = session?.audioList ?? [];
  return audioList.find((track) => track.isDefault)?.streamIndex ?? audioList[0]?.streamIndex ?? null;
}

export const usePlayerStore = create<PlayerStore>()((set) => ({
  session: null,
  status: 'idle',
  positionMs: 0,
  bufferedMs: 0,
  durationMs: 0,
  isLocked: false,
  controlsVisible: false,
  playbackSpeed: 1,
  videoAspect: 'default',
  activeSubtitleStreamIndex: null,
  activeAudioStreamIndex: null,
  isRestartingSession: false,
  restartNotice: null,
  audio: initialAudioState(),

  setSession: (session, opts) => {
    if (opts?.resetTrackSelection) {
      // 首次起播：选中态归零（字幕由播放页按 §4.8.3 自动选轨，音轨取默认轨/第一条）
      set({
        session,
        activeSubtitleStreamIndex: null,
        activeAudioStreamIndex: initialAudioIndex(session),
        isRestartingSession: false,
        restartNotice: null,
      });
      return;
    }
    // 会话替换（重启/重试）：仅换会话，不重置选中态（回填由 restartSession 第 5 步负责）
    set({ session });
  },
  setStatus: (status) => set({ status }),
  updateProgress: (positionMs, bufferedMs, durationMs) =>
    set({ positionMs, bufferedMs, durationMs }),
  setLocked: (isLocked) => set({ isLocked }),
  toggleControls: () => set((state) => ({ controlsVisible: !state.controlsVisible })),
  setControlsVisible: (controlsVisible) => set({ controlsVisible }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setVideoAspect: (videoAspect) => set({ videoAspect }),
  setActiveSubtitle: (activeSubtitleStreamIndex) => set({ activeSubtitleStreamIndex }),
  setActiveAudio: (activeAudioStreamIndex) => set({ activeAudioStreamIndex }),
  beginRestart: (restartNotice) => set({ isRestartingSession: true, restartNotice }),
  endRestart: () => set({ isRestartingSession: false, restartNotice: null }),
  setAudioState: (patch) => set((state) => ({ audio: { ...state.audio, ...patch } })),
  resetAudio: () => set({ audio: initialAudioState() }),
  reset: () =>
    set({
      session: null,
      status: 'idle',
      positionMs: 0,
      bufferedMs: 0,
      durationMs: 0,
      isLocked: false,
      controlsVisible: false,
      playbackSpeed: 1,
      videoAspect: 'default',
      activeSubtitleStreamIndex: null,
      activeAudioStreamIndex: null,
      isRestartingSession: false,
      restartNotice: null,
    }),
}));
