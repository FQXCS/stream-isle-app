/**
 * TV 播放页（TV-m3 §4.1）：编排 Video（react-native-video）+ 生命周期 + 上报，
 * 照搬手机 PlayerScreen 的 store 驱动模式——服务层零改动（PlaybackService/ProgressService/
 * playerStore 全共享）。TV 差异：① 挂载不锁横屏（TV 恒横，无 expo-screen-orientation）；
 * ② 不挂 GestureLayer（无触摸），控制层显隐触发源 = TvKeyLayer 遥控按键；③ 无锁屏/旋转/
 * 画中画/蜂窝降档/本地会话（TV 无意义或无下载引擎）；④ 截图仅 capture + 路径 toast
 * （不入系统相册，TV-m3-S2）；⑤ 退出收尾「即时 goBack + unmount 补报」照搬。
 * 时间口径：react-native-video 事件为秒，服务层/store 全部毫秒（页面层换算）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Video, {
  BufferingStrategyType,
  type OnLoadData,
  type OnProgressData,
  type OnVideoErrorData,
  SelectedTrackType,
  TextTrackType,
  type VideoRef,
} from 'react-native-video';

import type { AudioTrack, PlaybackSession, SubtitleTrack } from '@/adapter/model';
import { showToast } from '@/component/Toast';
import { useImmersiveAccent } from '@/component/useTheme';
import PlayerSnapshot from '../../../../modules/expo-player-snapshot';
import type { ResolutionTierKey } from '@/constant/resolution';
import { AUTO_NEXT_RESTART_NOTICE, DEFAULT_SUBTITLE_LANGUAGE } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { ProgressService } from '@/service/ProgressService';
import { playbackService } from '@/service/PlaybackService';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { abLoopSeekTarget, advanceAbLoop, type AbLoop } from '@/util/abLoop';
import { buildBufferSettings } from '@/util/buffer';
import { formatClock } from '@/util/format';
import type { PlaybackEndReason } from '@/util/resume';
import { sanitizedForLog } from '@/util/sanitize';
import { selectAutoSubtitleStreamIndex } from '@/util/subtitleSelect';

import { TvPressable } from '@tv/component/TvPressable';
import { TvControlOverlay, type TvOverlayFocusTarget } from '@tv/component/player/TvControlOverlay';
import { TvGestureHud, type TvHudState } from '@tv/component/player/TvGestureHud';
import { TvKeyLayer } from '@tv/component/player/TvKeyLayer';
import { TvSessionRestartOverlay } from '@tv/component/player/TvSessionRestartOverlay';
import { TvSettingsDrawer } from '@tv/component/player/TvSettingsDrawer';
import { TvSpeedMenu } from '@tv/component/player/TvSpeedMenu';
import { TV_HUD_HIDE_DELAY_MS } from '@tv/constant/player';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

/** 控制层菜单显隐（设置抽屉与倍速菜单互斥，none=全关） */
type VisibleMenu = 'none' | 'more' | 'speed';

/**
 * 起播默认字幕策略（照搬手机 M3 §4.8.3）：仅可外挂注入文本轨中匹配（非烧录且 vttUrl 已产出），
 * 偏好语言归一化等值比较 → isDefault → isForced；无命中不开启。烧录轨不自动激活。
 */
function autoSelectSubtitleStreamIndex(session: PlaybackSession): number | null {
  const preferred = useSettingsStore.getState().preferredSubtitleLang ?? DEFAULT_SUBTITLE_LANGUAGE;
  return selectAutoSubtitleStreamIndex(session.subtitleList, preferred);
}

export function TvPlayerScreen() {
  const immersiveAccent = useImmersiveAccent();
  const tr = useT();
  const route = useRoute<{ key: string; name: string; params: { session: PlaybackSession } }>();
  const navigation = useNavigation<TvNavigation>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // 路由会话为初始值；会话重启/重试后会话就地替换（store 驱动 Video source）
  const initialSession = route.params.session;
  const session = usePlayerStore((state) => state.session) ?? initialSession;
  const status = usePlayerStore((state) => state.status);
  const positionMs = usePlayerStore((state) => state.positionMs);
  const bufferedMs = usePlayerStore((state) => state.bufferedMs);
  const durationMs = usePlayerStore((state) => state.durationMs);
  const controlsVisible = usePlayerStore((state) => state.controlsVisible);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const subtitleDelayMs = usePlayerStore((state) => state.subtitleDelayMs);
  const audioDelayMs = usePlayerStore((state) => state.audioDelayMs);
  const videoAspect = usePlayerStore((state) => state.videoAspect);
  const activeSubtitleStreamIndex = usePlayerStore((state) => state.activeSubtitleStreamIndex);
  const activeAudioStreamIndex = usePlayerStore((state) => state.activeAudioStreamIndex);
  const isRestartingSession = usePlayerStore((state) => state.isRestartingSession);
  const settingsMaxResolutionTier = useSettingsStore((state) => state.maxResolutionTier);
  const settingsBufferTier = useSettingsStore((state) => state.bufferTier);
  const settingsCustomBuffer = useSettingsStore((state) => state.customBuffer);

  const videoRef = useRef<VideoRef>(null);
  const progressRef = useRef<ProgressService>(new ProgressService());
  /** 已收尾标记（finish 恰好一次；重试/连播后重置允许新会话再收尾） */
  const endReasonRef = useRef<PlaybackEndReason | null>(null);
  const [hud, setHud] = useState<TvHudState | null>(null);
  const hudHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 三菜单显隐（互斥） */
  const [visibleMenu, setVisibleMenu] = useState<VisibleMenu>('none');
  /** 控制层焦点落点（呼出=play；菜单关闭回触发按钮；重启恢复=play） */
  const [overlayFocusTarget, setOverlayFocusTarget] = useState<TvOverlayFocusTarget>('play');
  /** 顶栏焦点态（TvKeyLayer DOWN 隐藏判定） */
  const [topBarFocused, setTopBarFocused] = useState(false);
  /** SeekBar 焦点态（TvKeyLayer 步进上下文判定；JS 焦点事件追踪，fork 事件 tag 不可用） */
  const [seekBarFocused, setSeekBarFocused] = useState(false);
  /** 引擎音轨列表（onLoad 校正缓存；selectedAudioTrack 精确匹配优先） */
  const [engineAudioTracks, setEngineAudioTracks] = useState<
    { index: number; title?: string; language?: string }[]
  >([]);
  /** AB 循环区间（页面局部态不进 store，同手机）；按会话 ID 键控，ref 镜像供 handleProgress */
  const [abLoopEntry, setAbLoopEntry] = useState<{ sessionId: string; loop: AbLoop } | null>(null);
  const abLoopRef = useRef<{ sessionId: string; loop: AbLoop } | null>(null);
  const abLoop =
    abLoopEntry !== null && abLoopEntry.sessionId === session.playSessionId ? abLoopEntry.loop : null;
  /** 截图防重入（原生抓帧异步链路） */
  const snapshotBusyRef = useRef(false);

  // —— 进页初始化：store 会话 + 状态（首次起播选中态重置 + 默认字幕选轨）——
  useEffect(() => {
    const store = usePlayerStore.getState();
    store.setSession(initialSession, { resetTrackSelection: true });
    store.setStatus('loading');
    store.setControlsVisible(false);
    const autoSubtitleIndex = autoSelectSubtitleStreamIndex(initialSession);
    if (autoSubtitleIndex !== null) {
      store.setActiveSubtitle(autoSubtitleIndex);
    }
  }, [initialSession]);

  // —— 收尾（恰好一次；退回/播完/出错重试/切换失败共用）——
  const finishOnce = useCallback(async (reason: PlaybackEndReason) => {
    if (endReasonRef.current !== null) {
      return;
    }
    endReasonRef.current = reason;
    const store = usePlayerStore.getState();
    progressRef.current.end();
    if (store.session !== null) {
      await playbackService.finish(store.session, store.positionMs, reason);
    }
  }, []);

  // —— unmount 收尾：补报最终 Progress + 清 store（退出即时返回，收尾后台兜底）——
  useEffect(
    () => () => {
      void finishOnce(endReasonRef.current ?? 'user_exit').catch(() => {
        // 收尾失败静默（Stopped 重试逻辑在 service 内）
      });
      usePlayerStore.getState().reset();
    },
    [finishOnce]
  );

  // —— AppState：进后台立即暂停并即时上报；回前台按 store 重新对齐 native（不自动恢复）——
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const store = usePlayerStore.getState();
      if (state === 'background') {
        videoRef.current?.pause();
        if (store.status === 'playing') {
          store.setStatus('paused');
          if (store.session !== null) {
            progressRef.current.notifyPaused(store.session, store.positionMs);
          }
        }
        return;
      }
      if (state === 'active') {
        if (store.status === 'playing') {
          videoRef.current?.resume();
        } else if (store.status === 'paused') {
          videoRef.current?.pause();
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // —— BACK 层级（风险 1/3 单通道收口）：抽屉/菜单开→关（焦点回触发按钮）；
  // 控制层显→隐；否则退出（返回 false 交 native-stack pop → unmount 补报）——
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (visibleMenu !== 'none') {
        setOverlayFocusTarget(visibleMenu === 'more' ? 'more' : 'speed');
        setVisibleMenu('none');
        return true;
      }
      if (usePlayerStore.getState().controlsVisible) {
        usePlayerStore.getState().setControlsVisible(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visibleMenu]);

  // —— 重启完成（isRestartingSession true→false）：恢复控制层，焦点重落播放键 ——
  const prevRestartingRef = useRef(false);
  useEffect(() => {
    const wasRestarting = prevRestartingRef.current;
    prevRestartingRef.current = isRestartingSession;
    if (!wasRestarting || isRestartingSession) {
      return;
    }
    setOverlayFocusTarget('play');
    usePlayerStore.getState().setControlsVisible(true);
  }, [isRestartingSession]);

  // —— Video 事件 ——
  const handleLoad = useCallback(
    (data: OnLoadData) => {
      const store = usePlayerStore.getState();
      const startMs = data.currentTime * 1000;
      store.updateProgress(startMs, 0, data.duration * 1000);
      store.setStatus('playing');
      setEngineAudioTracks(
        data.audioTracks.map((track) => ({ index: track.index, title: track.title, language: track.language }))
      );
      // 会话重启完成（onLoad → endRestart）
      if (store.isRestartingSession) {
        store.endRestart();
      }
      const currentSession = store.session ?? initialSession;
      void (async () => {
        try {
          await playbackService.begin(currentSession, startMs);
        } catch {
          // Playing 失败静默（进度上报链路不受影响）
        }
        progressRef.current.begin(currentSession);
      })();
    },
    [initialSession]
  );

  const handleProgress = useCallback((data: OnProgressData) => {
    const store = usePlayerStore.getState();
    const position = data.currentTime * 1000;
    const buffered = data.playableDuration * 1000;
    const duration = data.seekableDuration * 1000;
    store.updateProgress(position, buffered, duration);
    if (store.session !== null) {
      progressRef.current.notifyProgress(store.session, position, store.status !== 'playing');
    }
    // AB 循环：到达 B 点回跳 A（ref 镜像避免回调重建；会话 ID 不符视为已失效）
    const loopEntry = abLoopRef.current;
    const loop =
      loopEntry !== null && loopEntry.sessionId === store.session?.playSessionId
        ? loopEntry.loop
        : null;
    const loopTarget = abLoopSeekTarget(loop, position);
    if (loopTarget !== null) {
      videoRef.current?.seek(loopTarget / 1000);
      store.updateProgress(loopTarget, buffered, duration);
      if (store.session !== null) {
        progressRef.current.notifySeek(store.session, loopTarget);
      }
    }
  }, []);

  const handleError = useCallback((error: OnVideoErrorData) => {
    const store = usePlayerStore.getState();
    store.setStatus('error');
    if (store.session !== null) {
      progressRef.current.notifyError(store.session, store.positionMs);
    }
    // 日志脱敏：errorString 可能含带 api_key 的完整播放 URL
    console.warn(
      '[TV播放页] 播放器错误:',
      sanitizedForLog(error.error?.errorString ?? '未知错误')
    );
  }, []);

  const handleEnd = useCallback(() => {
    void (async () => {
      const store = usePlayerStore.getState();
      // 自然播完：按完成时长收尾（服务器判定 + 客户端 ≥95% 兜底）
      if (store.durationMs > 0) {
        store.updateProgress(store.durationMs, store.bufferedMs, store.durationMs);
      }
      await finishOnce('natural_end');
      // 自动连播下一集：Episode 经 getNextUp 换源续播；非 Episode 退出播放页
      const current = store.session ?? initialSession;
      if (current.itemType === 'Episode') {
        try {
          const next = await playbackService.playNextEpisode(current);
          if (next !== null) {
            endReasonRef.current = null;
            // 先换会话再置重启浮层；新集 onLoad 时 endRestart 收起（ falling-edge 恢复焦点）
            store.setSession(next, { resetTrackSelection: true });
            store.beginRestart(tr(AUTO_NEXT_RESTART_NOTICE));
            const autoSubtitleIndex = autoSelectSubtitleStreamIndex(next);
            if (autoSubtitleIndex !== null) {
              store.setActiveSubtitle(autoSubtitleIndex);
            }
            store.setStatus('loading');
            setVisibleMenu('none');
            store.setControlsVisible(false);
            return;
          }
        } catch {
          // 连播失败静默：按正常播完退出（旧会话已收尾）
        }
      }
      navigation.goBack();
    })();
  }, [finishOnce, navigation, initialSession, tr]);

  // —— 控制动作 ——
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    const store = usePlayerStore.getState();
    if (store.status === 'paused') {
      video.resume();
      store.setStatus('playing');
      if (store.session !== null) {
        progressRef.current.notifyResumed(store.session, store.positionMs);
      }
    } else if (store.status === 'playing') {
      video.pause();
      store.setStatus('paused');
      if (store.session !== null) {
        progressRef.current.notifyPaused(store.session, store.positionMs);
      }
    }
  }, []);

  const seekTo = useCallback((targetMs: number) => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.seek(targetMs / 1000);
    const store = usePlayerStore.getState();
    store.updateProgress(targetMs, store.bufferedMs, store.durationMs);
    if (store.session !== null) {
      progressRef.current.notifySeek(store.session, targetMs);
    }
  }, []);

  const showHud = useCallback((next: TvHudState) => {
    setHud(next);
    if (hudHideTimerRef.current !== null) {
      clearTimeout(hudHideTimerRef.current);
    }
  }, []);

  const hideHudLater = useCallback(() => {
    if (hudHideTimerRef.current !== null) {
      clearTimeout(hudHideTimerRef.current);
    }
    hudHideTimerRef.current = setTimeout(() => setHud(null), TV_HUD_HIDE_DELAY_MS);
  }, []);

  // —— 遥控 seek 步进（控制层隐藏 ←→ / SeekBar 聚焦 ←→ 共用）：clamp + seekTo + HUD 预览 ——
  const seekBy = useCallback(
    (deltaMs: number) => {
      const store = usePlayerStore.getState();
      if (store.status !== 'playing' && store.status !== 'paused') {
        return;
      }
      if (store.durationMs <= 0) {
        return;
      }
      const from = store.positionMs;
      const target = Math.min(store.durationMs, Math.max(0, from + deltaMs));
      seekTo(target);
      showHud({ kind: 'seek', value: target, deltaMs: target - from });
      hideHudLater();
    },
    [seekTo, showHud, hideHudLater]
  );

  // —— AB 循环三态按钮（设 A → 设 B → 清除）；越 B 回 A 判定在 handleProgress ——
  const handleAbLoop = useCallback(() => {
    const store = usePlayerStore.getState();
    const sessionId = store.session?.playSessionId ?? initialSession.playSessionId;
    const entry = abLoopRef.current;
    const current = entry !== null && entry.sessionId === sessionId ? entry.loop : null;
    const next = advanceAbLoop(current, store.positionMs);
    const nextEntry = next === null ? null : { sessionId, loop: next };
    abLoopRef.current = nextEntry;
    setAbLoopEntry(nextEntry);
    if (next === null) {
      showToast(tr('player.abLoopCleared'), 'info');
    } else if (next.bMs === null) {
      showToast(tr('player.abLoopSetA', { time: formatClock(next.aMs) }), 'info');
    } else {
      showToast(tr('player.abLoopActive', { a: formatClock(next.aMs), b: formatClock(next.bMs) }), 'info');
    }
  }, [tr, initialSession.playSessionId]);

  // —— 截图切片（TV-m3-S2）：原生抓帧 → 路径 toast；不入系统相册（TV 闭包不带 expo-media-library）——
  const handleSnapshot = useCallback(() => {
    if (snapshotBusyRef.current) {
      return;
    }
    snapshotBusyRef.current = true;
    void (async () => {
      try {
        const path = await PlayerSnapshot.capture();
        showToast(tr('tv.snapshotSavedPath', { path }), 'info');
      } catch {
        showToast(tr('tv.snapshotFailed'), 'error');
      } finally {
        snapshotBusyRef.current = false;
      }
    })();
  }, [tr]);

  // —— 会话切换统一编排：service 内完成 Stopped→DELETE→resolve→setSession→回填；
  // 非 null（重启路径）关菜单 + 隐控制层，重启完成 falling-edge 恢复焦点落播放键；
  // resolve 失败 → finish 收尾退出 ——
  const runSwitch = useCallback(
    async (action: () => Promise<PlaybackSession | null>): Promise<void> => {
      const store = usePlayerStore.getState();
      if (store.isRestartingSession || store.session === null) {
        return;
      }
      try {
        const result = await action();
        if (result !== null) {
          setVisibleMenu('none');
          usePlayerStore.getState().setControlsVisible(false);
        }
      } catch (err) {
        console.warn('[TV播放页] 会话切换失败:', err instanceof Error ? err.message : '');
        await finishOnce('error');
        showToast(tr('player.switchFailed'), 'error');
        navigation.goBack();
      }
    },
    [finishOnce, navigation, tr]
  );

  // 分辨率选择：先落盘再 switchResolution；直连仅提示（设置下次转码会话生效）
  const handleResolutionSelect = useCallback(
    (tier: ResolutionTierKey) => {
      useSettingsStore.getState().actions.setMaxResolutionTier(tier);
      void runSwitch(async () => {
        const store = usePlayerStore.getState();
        if (store.session === null) {
          return null;
        }
        const newSession = await playbackService.switchResolution(store.session, tier);
        if (newSession === null) {
          showToast(tr('player.directResolutionNotice'), 'info');
        }
        return newSession;
      });
    },
    [runSwitch, tr]
  );

  // 字幕选择：烧录轨进出由 switchSubtitle 判定重启；纯客户端切换（null）service 已更新选中态
  const handleSubtitleSelect = useCallback(
    (track: SubtitleTrack | null) => {
      void runSwitch(async () => {
        const current = usePlayerStore.getState();
        if (current.session === null) {
          return null;
        }
        return playbackService.switchSubtitle(current.session, track);
      });
    },
    [runSwitch]
  );

  // 音轨选择：直连走 ExoPlayer selectedAudioTrack 即时生效；转码经会话重启
  const handleAudioSelect = useCallback(
    (track: AudioTrack) => {
      const store = usePlayerStore.getState();
      if (store.session === null) {
        return;
      }
      if (store.session.playMethod === 'DirectPlay') {
        store.setActiveAudio(track.streamIndex);
        return;
      }
      const currentSession = store.session;
      void runSwitch(() => playbackService.switchAudioTrack(currentSession, track));
    },
    [runSwitch]
  );

  // —— 错误重试：finish 旧会话（出错位置）→ 重新 resolve（沿用旧档位）→ 就地替换会话 ——
  const retry = useCallback(() => {
    void (async () => {
      const store = usePlayerStore.getState();
      const currentPosition = store.positionMs;
      const previousMaxResolutionTier = store.session?.maxResolutionTier;
      await finishOnce('error');
      endReasonRef.current = null;
      store.setSession(null);
      try {
        const newSession = await playbackService.resolve(initialSession.itemId, {
          startPositionMs: currentPosition,
          maxResolutionTier: previousMaxResolutionTier,
        });
        store.setSession(newSession);
        store.setStatus('loading');
      } catch (err) {
        store.setStatus('error');
        if (err instanceof Error) {
          console.warn('[TV播放页] 重试失败:', err.message);
        }
      }
    })();
  }, [finishOnce, initialSession.itemId]);

  // 退出（控制层返回按钮 / BACK 兜底）：立即 goBack，收尾交 unmount 补报
  const exitPlayer = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // —— 控制层显隐与菜单入口（TvKeyLayer 回调）——
  const handleShowControls = useCallback(() => {
    setOverlayFocusTarget('play');
    usePlayerStore.getState().setControlsVisible(true);
  }, []);
  const handleHideControls = useCallback(() => {
    usePlayerStore.getState().setControlsVisible(false);
  }, []);
  const openMoreMenu = useCallback(() => {
    // MENU 直达抽屉：确保控制层挂载（抽屉关闭后焦点回 more 按钮有落点）
    usePlayerStore.getState().setControlsVisible(true);
    setVisibleMenu('more');
  }, []);
  const openSpeedMenu = useCallback(() => {
    setVisibleMenu('speed');
  }, []);

  const isPlaying = status === 'playing';
  // 屏幕宽高比（设置抽屉视频页）：16:9/4:3 居中定比盒内拉伸；其余全屏适配
  const videoBox = useMemo(() => {
    if (videoAspect !== '16:9' && videoAspect !== '4:3') {
      return null;
    }
    const ratio = videoAspect === '16:9' ? 16 / 9 : 4 / 3;
    const width = Math.min(screenWidth, screenHeight * ratio);
    return { width, height: width / ratio };
  }, [videoAspect, screenWidth, screenHeight]);
  const videoResizeMode =
    videoAspect === 'default' ? 'contain' : videoAspect === 'fill' ? 'cover' : 'stretch';

  // 缓冲配置派生（档位/自定义 → bufferConfig + 策略）
  const bufferSettings = useMemo(
    () => buildBufferSettings(settingsBufferTier, settingsCustomBuffer, session.runTimeMs),
    [settingsBufferTier, settingsCustomBuffer, session.runTimeMs]
  );

  const source = useMemo(
    () => ({
      uri: session.url,
      startPosition: session.positionMsAtStart,
      bufferConfig: bufferSettings.bufferConfig,
      // 外挂文本轨注入：只注入非烧录轨；uri 用 adapter 已拼好的完整 URL
      textTracks: session.subtitleList
        .filter((track) => !track.burnIn && track.vttUrl !== undefined)
        .map((track) => ({
          title: track.title ?? tr('player.subtitleFallback', { index: track.streamIndex + 1 }),
          // 服务器 Language 为 ISO 639-2 三字码，RN Video 类型仅收两字码；选中经 index 控制，原样透传
          language: (track.language ?? '') as never,
          type: TextTrackType.VTT,
          uri: track.vttUrl as string,
        })),
    }),
    [session.url, session.positionMsAtStart, session.subtitleList, bufferSettings.bufferConfig, tr]
  );

  // selectedTextTrack 派生：烧录中/未开字幕 → disabled；否则按非烧录注入序号选中
  const selectedTextTrack = useMemo(() => {
    const activeTrack = session.subtitleList.find(
      (track) => track.streamIndex === activeSubtitleStreamIndex
    );
    if (activeTrack?.burnIn || activeSubtitleStreamIndex === null) {
      return { type: SelectedTrackType.DISABLED };
    }
    const localIndex = session.subtitleList
      .filter((track) => !track.burnIn && track.vttUrl !== undefined)
      .findIndex((track) => track.streamIndex === activeSubtitleStreamIndex);
    if (localIndex < 0) {
      return { type: SelectedTrackType.DISABLED };
    }
    return { type: SelectedTrackType.INDEX, value: localIndex };
  }, [session.subtitleList, activeSubtitleStreamIndex]);

  // 字幕延时仅在线外挂文本轨可调（烧录已进画面）
  const activeSubtitleTrack = session.subtitleList.find(
    (track) => track.streamIndex === activeSubtitleStreamIndex
  );
  const subtitleDelayDisabled =
    activeSubtitleStreamIndex === null ||
    activeSubtitleTrack?.burnIn === true ||
    activeSubtitleTrack?.vttUrl === undefined;

  // selectedAudioTrack 派生：引擎音轨按 language/title 精确匹配优先；否则服务器序号假设
  const selectedAudioTrack = useMemo(() => {
    if (activeAudioStreamIndex === null) {
      return undefined;
    }
    const target = session.audioList.find((track) => track.streamIndex === activeAudioStreamIndex);
    if (target === undefined) {
      return undefined;
    }
    const engineMatched = engineAudioTracks.find(
      (engine) =>
        (target.language !== undefined && engine.language === target.language) ||
        (target.title !== undefined && engine.title === target.title)
    );
    if (engineMatched !== undefined) {
      return { type: SelectedTrackType.INDEX, value: engineMatched.index };
    }
    const localIndex = session.audioList.findIndex(
      (track) => track.streamIndex === activeAudioStreamIndex
    );
    return localIndex >= 0 ? { type: SelectedTrackType.INDEX, value: localIndex } : undefined;
  }, [session.audioList, activeAudioStreamIndex, engineAudioTracks]);

  // 当前生效档位（session.maxResolutionTier；直连回退用户设置档位）
  const activeResolutionTier: ResolutionTierKey =
    session.maxResolutionTier ?? settingsMaxResolutionTier;

  return (
    <View style={styles.container}>
      <View style={styles.videoWrap} pointerEvents="none">
        <Video
          ref={videoRef}
          source={source}
          bufferingStrategy={bufferSettings.bufferingStrategy as BufferingStrategyType}
          style={videoBox ?? StyleSheet.absoluteFill}
          resizeMode={videoResizeMode}
          paused={status !== 'playing'}
          rate={playbackSpeed}
          audioDelayMs={audioDelayMs}
          subtitleDelayMs={subtitleDelayMs}
          progressUpdateInterval={500}
          selectedTextTrack={selectedTextTrack}
          selectedAudioTrack={selectedAudioTrack}
          preventsDisplaySleepDuringVideoPlayback
          onLoad={handleLoad}
          onProgress={handleProgress}
          onEnd={handleEnd}
          onError={handleError}
        />
      </View>
      {/* 控制层（可见时；焦点存在挂起自动隐藏） */}
      {controlsVisible && (
        <TvControlOverlay
          title={session.name ?? ''}
          isPlaying={isPlaying}
          positionMs={positionMs}
          bufferedMs={bufferedMs}
          durationMs={durationMs}
          abLoop={abLoop}
          playbackSpeed={playbackSpeed}
          preferredFocus={overlayFocusTarget}
          menuOpen={visibleMenu !== 'none'}
          onExit={exitPlayer}
          onTogglePlay={togglePlay}
          onOpenMoreMenu={openMoreMenu}
          onOpenSpeedMenu={openSpeedMenu}
          onAbLoop={handleAbLoop}
          onSnapshot={handleSnapshot}
          onSeekBarFocused={setSeekBarFocused}
          onTopBarFocused={setTopBarFocused}
        />
      )}
      {/* 倍速菜单（底部倍速按钮入口；选中即应用并关闭） */}
      {visibleMenu === 'speed' && (
        <TvSpeedMenu
          current={playbackSpeed}
          onSelect={(speed) => {
            usePlayerStore.getState().setPlaybackSpeed(speed);
            setOverlayFocusTarget('speed');
            setVisibleMenu('none');
          }}
        />
      )}
      {/* 设置抽屉（MENU / 更多入口；视频/音频/字幕三页签） */}
      {visibleMenu === 'more' && (
        <TvSettingsDrawer
          aspect={videoAspect}
          onAspect={(aspect) => usePlayerStore.getState().setVideoAspect(aspect)}
          showResolution={session.playMethod === 'Transcode'}
          activeTier={activeResolutionTier}
          sourceHeight={session.sourceHeight}
          onResolution={handleResolutionSelect}
          audioTracks={session.audioList}
          activeAudioIndex={activeAudioStreamIndex}
          onAudioSelect={handleAudioSelect}
          subtitleTracks={session.subtitleList}
          activeSubtitleIndex={activeSubtitleStreamIndex}
          onSubtitleSelect={handleSubtitleSelect}
          audioDelayMs={audioDelayMs}
          onAudioDelay={(ms) => usePlayerStore.getState().setAudioDelay(ms)}
          subtitleDelayMs={subtitleDelayMs}
          onSubtitleDelay={(ms) => usePlayerStore.getState().setSubtitleDelay(ms)}
          subtitleDelayDisabled={subtitleDelayDisabled}
        />
      )}
      <TvGestureHud hud={hud} />
      {/* 会话重启浮层（重启中屏蔽按键，onLoad 后 endRestart 收起） */}
      <TvSessionRestartOverlay />
      {/* 加载态（重启浮层自带转圈，避免叠两个圈） */}
      {status === 'loading' && !isRestartingSession && (
        <View style={styles.centerLayer} pointerEvents="none">
          <ActivityIndicator color={immersiveAccent.accent} size="large" />
        </View>
      )}
      {/* 错误态 + 重试/退出（焦点化按钮，首键 hasTVPreferredFocus） */}
      {status === 'error' && (
        <View style={styles.errorLayer}>
          <Text style={styles.errorText}>
            {session.playMethod === 'Transcode'
              ? tr('player.errorTranscode')
              : tr('player.errorPlayback')}
          </Text>
          <TvPressable
            focusKind="card"
            focusable
            hasTVPreferredFocus
            accessibilityRole="button"
            accessibilityLabel={tr('common.retry')}
            onPress={retry}
            style={[styles.retryButton, { backgroundColor: immersiveAccent.accent }]}
          >
            <Text style={[styles.retryText, { color: immersiveAccent.accentOn }]}>
              {tr('common.retry')}
            </Text>
          </TvPressable>
          <TvPressable
            focusKind="card"
            focusable
            accessibilityRole="button"
            accessibilityLabel={tr('player.exitPlayback')}
            onPress={exitPlayer}
            style={[styles.retryButton, { backgroundColor: immersiveAccent.accent }]}
          >
            <Text style={[styles.retryText, { color: immersiveAccent.accentOn }]}>
              {tr('player.exitPlayback')}
            </Text>
          </TvPressable>
        </View>
      )}
      {/* 遥控按键层（设计 §8.1 全表；BACK 走 BackHandler 不在此处理） */}
      <TvKeyLayer
        active={status === 'playing' || status === 'paused'}
        controlsVisible={controlsVisible}
        menuOpen={visibleMenu !== 'none'}
        isRestartingSession={isRestartingSession}
        seekBarFocused={seekBarFocused}
        topBarFocused={topBarFocused}
        onShowControls={handleShowControls}
        onHideControls={handleHideControls}
        onSeekBy={seekBy}
        onOpenMoreMenu={openMoreMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  videoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.m,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  errorText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
  retryButton: {
    borderRadius: COLORS.posterRadius,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.s,
  },
  retryText: { fontSize: FONT_SIZE.body },
});