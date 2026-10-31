/**
 * 播放页（M2 文档 §4.12 + M3 文档 §4.8）：编排 Video（react-native-video）+ 生命周期 + 上报。
 * M3 增量：HLS 转码分支（source 直用会话 URL）、外挂文本轨注入与纯客户端切换、烧录字幕/
 * 码率/转码音轨三类会话重启编排、三菜单入口、蜂窝自动降档订阅、SessionRestartOverlay。
 * 挂载即锁横屏、退出恢复竖屏；控制层/锁屏/三组手势；AppState 进后台暂停即报；
 * back/unmount 报 Stopped、onEnd 收尾（02 §4.12 生命周期状态机）。
 * 时间口径：react-native-video 事件为秒，服务层/store 全部毫秒（页面层换算）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  useWindowDimensions,
  View,
} from 'react-native';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type OnVideoErrorData,
  SelectedTrackType,
  TextTrackType,
  type VideoRef,
} from 'react-native-video';
import NetInfo from '@react-native-community/netinfo';
import * as ScreenOrientation from 'expo-screen-orientation';

import type { AudioTrack, PlaybackSession, SubtitleTrack } from '@/adapter/model';
import PlaybackGestures from '../../../modules/expo-playback-gestures';
import type { BitrateTierKey } from '@/constant/bitrate';
import {
  BITRATE_TIER_LIST,
  BITRATE_TIER_MAP,
  CELLULAR_BITRATE_TIER,
} from '@/constant/bitrate';
import {
  AUTO_NEXT_RESTART_NOTICE,
  CONTROLS_AUTO_HIDE_MS,
  DEFAULT_SUBTITLE_LANGUAGE,
  SEEK_FULL_WIDTH_SECONDS,
} from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { AudioTrackMenu } from '@/page/player/components/AudioTrackMenu';
import { BitrateMenu } from '@/page/player/components/BitrateMenu';
import { ControlOverlay } from '@/page/player/components/ControlOverlay';
import { GestureHud, type HudState } from '@/page/player/components/GestureHud';
import { GestureLayer } from '@/page/player/components/GestureLayer';
import { SessionRestartOverlay } from '@/page/player/components/SessionRestartOverlay';
import { SubtitleMenu } from '@/page/player/components/SubtitleMenu';
import type { RootStackParamList } from '@/page/navigation/types';
import { ProgressService } from '@/service/ProgressService';
import { playbackService } from '@/service/PlaybackService';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { resolveBitrateTierForNetwork } from '@/util/bitrate';
import { selectAutoSubtitleStreamIndex } from '@/util/subtitleSelect';
import { sanitizedForLog } from '@/util/sanitize';
import type { PlaybackEndReason } from '@/util/resume';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** HUD 延迟隐藏（手势结束后气泡停留时长） */
const HUD_HIDE_DELAY_MS = 600;

/** 控制层菜单显隐（三菜单互斥，none=全关） */
type VisibleMenu = 'none' | 'subtitle' | 'audio' | 'bitrate';

/**
 * 起播默认字幕策略（03 §4.8.3 + 04 §4.5 匹配定稿，仅首次起播/连播新集执行）：
 * 仅在可外挂注入的文本轨中匹配——非烧录且 vttUrl 已产出（DeliveryMethod 缺省/Embed 的轨
 * 无 vttUrl、播放器无法加载，命中会造成「高亮已选而画面无字幕」）；偏好语言经
 * normalizeSubtitleLang 归一化后与轨语言等值比较（04 §4.5：前缀法匹配不到 zh/Chinese
 * 形态的中文轨）→ isDefault → isForced；无命中不开启字幕。
 * 烧录轨不自动激活（烧录只由用户手动选择触发，减少转码触发面）。
 */
function autoSelectSubtitleStreamIndex(session: PlaybackSession): number | null {
  const preferred = useSettingsStore.getState().preferredSubtitleLang ?? DEFAULT_SUBTITLE_LANGUAGE;
  return selectAutoSubtitleStreamIndex(session.subtitleList, preferred);
}

export function PlayerScreen() {
  const route = useRoute<{ key: string; name: string; params: { session: PlaybackSession } }>();
  const navigation = useNavigation<NavigationProp>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // 路由会话为初始值；会话重启/重试后会话就地替换（store 驱动 Video source）
  const initialSession = route.params.session;
  const session = usePlayerStore((state) => state.session) ?? initialSession;
  const status = usePlayerStore((state) => state.status);
  const positionMs = usePlayerStore((state) => state.positionMs);
  const bufferedMs = usePlayerStore((state) => state.bufferedMs);
  const durationMs = usePlayerStore((state) => state.durationMs);
  const isLocked = usePlayerStore((state) => state.isLocked);
  const controlsVisible = usePlayerStore((state) => state.controlsVisible);
  const activeSubtitleStreamIndex = usePlayerStore((state) => state.activeSubtitleStreamIndex);
  const activeAudioStreamIndex = usePlayerStore((state) => state.activeAudioStreamIndex);
  // 会话重启中（SessionRestartOverlay 自行订阅渲染；本页用于重启结束后的网络补判）
  const isRestartingSession = usePlayerStore((state) => state.isRestartingSession);
  const settingsMaxBitrateMode = useSettingsStore((state) => state.maxBitrateMode);

  const videoRef = useRef<VideoRef>(null);
  const progressRef = useRef<ProgressService>(new ProgressService());
  /** 已收尾标记（finish 恰好一次；重试后重置允许新会话再收尾） */
  const endReasonRef = useRef<PlaybackEndReason | null>(null);
  /** 手势亮度/音量（worklet 读写；挂载时从原生读初值） */
  const brightnessSV = useSharedValue(0.5);
  const volumeSV = useSharedValue(0.5);
  const seekStartMsSV = useSharedValue(0);
  const seekTargetMsSV = useSharedValue(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const hudHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 锁屏态解锁按钮显隐（单击呼出后自动隐藏，02 §4.12「单击仅显示解锁按钮」） */
  const [unlockVisible, setUnlockVisible] = useState(false);
  /** 三菜单显隐（互斥） */
  const [visibleMenu, setVisibleMenu] = useState<VisibleMenu>('none');
  /** 当前连接类型（蜂窝提示与降档判定；netinfo 回调维护） */
  const [connectionType, setConnectionType] = useState<string | null>(null);
  /** 引擎音轨列表（onLoad 校正缓存；精确匹配优先于「服务器顺序=引擎顺序」假设） */
  const [engineAudioTracks, setEngineAudioTracks] = useState<
    { index: number; title?: string; language?: string }[]
  >([]);
  /**
   * 引擎内嵌文本轨列表（M6 本地会话消费，06 文档 §4.4.2）：本地 fileUri 会话的字幕
   * 仅来自容器内嵌轨（react-native-video onLoad textTracks），无服务器外挂 vtt。
   */
  const [engineTextTracks, setEngineTextTracks] = useState<
    { index: number; title?: string; language?: string }[]
  >([]);

  // —— 进页初始化：store 会话 + 状态（首次起播：选中态重置 + 默认字幕选轨，03 §4.8.3）——
  useEffect(() => {
    const store = usePlayerStore.getState();
    store.setSession(initialSession, { resetTrackSelection: true });
    store.setStatus('loading');
    store.setLocked(false);
    store.setControlsVisible(false);
    const autoSubtitleIndex = autoSelectSubtitleStreamIndex(initialSession);
    if (autoSubtitleIndex !== null) {
      store.setActiveSubtitle(autoSubtitleIndex);
    }
  }, [initialSession]);

  // 挂载即锁横屏、退出恢复竖屏（02 §4.12）
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch {
          // 锁横屏失败（个别 ROM）不阻断播放
        }
      })();
      return () => {
        void ScreenOrientation.unlockAsync().catch(() => {
          // 恢复失败静默
        });
      };
    }, [])
  );

  // 亮度/音量初值（手势起点用；挂载时读原生真实值回填）
  useEffect(() => {
    void PlaybackGestures.getMusicVolume()
      .then((volume) => {
        volumeSV.value = volume;
      })
      .catch(() => {
        // 原生读取失败保持默认值（手势仍可用，只是起点非真实值）
      });
    // 窗口亮度：-1 表示跟随系统（02 §4.8 契约），此时真实亮度无法经本模块获知
    // （读系统亮度超出 §4.8 四方法契约），保持现值——首次手势落点可能与系统亮度有偏差，属已知限制
    void PlaybackGestures.getWindowBrightness()
      .then((brightness) => {
        if (brightness >= 0) {
          brightnessSV.value = brightness;
        }
      })
      .catch(() => {
        // 原生读取失败保持默认值
      });
  }, [brightnessSV, volumeSV]);

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

  // —— unmount 收尾：报 Stopped + 亮度恢复跟随系统 + 清 store（02 §4.8/§4.12）——
  useEffect(
    () => () => {
      void finishOnce(endReasonRef.current ?? 'user_exit').catch(() => {
        // 收尾失败静默（Stopped 重试逻辑在 service 内）
      });
      // 窗口亮度恢复 -1 跟随系统（02 §4.8）
      void PlaybackGestures.setWindowBrightness(-1).catch(() => {
        // 静默
      });
      usePlayerStore.getState().reset();
    },
    // 仅卸载时执行一次收尾
    [finishOnce]
  );

  // —— AppState：进后台 → 立即暂停并即时上报一次（设计文档 §7.2/§11）；回前台不自动恢复 ——
  // 暂停 ≠ 退出：不停会话（转码分片由服务器会话超时兜底，03 §4.6.3/§7 风险 8）
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') {
        return;
      }
      const store = usePlayerStore.getState();
      videoRef.current?.pause();
      if (store.status === 'playing') {
        store.setStatus('paused');
        if (store.session !== null) {
          progressRef.current.notifyPaused(store.session, store.positionMs);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // —— Video 事件（02 §4.5 编排表 + M3 §4.8.2）——
  const handleLoad = useCallback(
    (data: OnLoadData) => {
      const store = usePlayerStore.getState();
      // 实际起点（startPosition 生效后的当前帧位置）；时长一并回填
      const startMs = data.currentTime * 1000;
      store.updateProgress(startMs, 0, data.duration * 1000);
      store.setStatus('playing');
      // 引擎音轨缓存（03 §4.8.2 音轨精确匹配的候选；selectedAudioTrack 派生消费）
      setEngineAudioTracks(data.audioTracks.map((track) => ({ index: track.index, title: track.title, language: track.language })));
      // M6：引擎内嵌文本轨缓存（本地会话字幕菜单数据源，06 §4.4.2 控制层降级）
      setEngineTextTracks(
        (data.textTracks ?? []).map((track) => ({ index: track.index, title: track.title, language: track.language }))
      );
      // 会话重启完成（03 §4.8.2：onLoad → begin → endRestart）
      if (store.isRestartingSession) {
        store.endRestart();
      }
      const currentSession = store.session ?? initialSession;
      void (async () => {
        try {
          // Playing 上报携带实际起点（02 §4.13 时序：PositionTicks=起点；重启后带新 PlaySessionId）
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
  }, []);

  const handleError = useCallback((error: OnVideoErrorData) => {
    const store = usePlayerStore.getState();
    store.setStatus('error');
    if (store.session !== null) {
      progressRef.current.notifyError(store.session, store.positionMs);
    }
    // 日志脱敏（02 §4.3/§4.14）：errorString 透传 ExoPlayer 异常文本，网络/403 场景
    // 可能含带 api_key 的完整播放 URL，统一经 sanitizedForLog 处理后再留痕
    console.warn(
      '[播放页] 播放器错误:',
      sanitizedForLog(error.error?.errorString ?? '未知错误')
    );
  }, []);

  const handleEnd = useCallback(() => {
    void (async () => {
      const store = usePlayerStore.getState();
      // 自然播完：按完成时长收尾（服务器判定 + 客户端 ≥95% 兜底双保险，02 §4.5）
      if (store.durationMs > 0) {
        store.updateProgress(store.durationMs, store.bufferedMs, store.durationMs);
      }
      await finishOnce('natural_end');
      // 自动连播下一集（04 §4.4）：集数场景 natural_end 后经 getNextUp 换源续播，
      // 进度从 0 起新会话上报；电影等非集内容照旧退出播放页
      const current = store.session ?? initialSession;
      if (current.itemType === 'Episode') {
        try {
          const next = await playbackService.playNextEpisode(current);
          if (next !== null) {
            // 新会话允许再次收尾（连播后再退出仍需报 Stopped）
            endReasonRef.current = null;
            // 先换会话（resetTrackSelection 会同时清重启态），再置重启浮层：
            // 新集 onLoad 时 endRestart 收起（03 §4.8.2 时序）
            store.setSession(next, { resetTrackSelection: true });
            store.beginRestart(AUTO_NEXT_RESTART_NOTICE);
            // 新集字幕按 03 §4.8.3 重新自动选轨（音轨由 resetTrackSelection 取默认轨）
            const autoSubtitleIndex = autoSelectSubtitleStreamIndex(next);
            if (autoSubtitleIndex !== null) {
              store.setActiveSubtitle(autoSubtitleIndex);
            }
            store.setStatus('loading');
            return;
          }
        } catch {
          // 连播失败静默：按正常播完退出（旧会话已收尾，无残留）
        }
      }
      navigation.goBack();
    })();
  }, [finishOnce, navigation, initialSession]);

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

  const showHud = useCallback((next: HudState) => {
    setHud(next);
    if (hudHideTimerRef.current !== null) {
      clearTimeout(hudHideTimerRef.current);
    }
  }, []);

  const hideHudLater = useCallback(() => {
    if (hudHideTimerRef.current !== null) {
      clearTimeout(hudHideTimerRef.current);
    }
    hudHideTimerRef.current = setTimeout(() => setHud(null), HUD_HIDE_DELAY_MS);
  }, []);

  // 单击手势：切换控制层显隐；锁屏时单击仅呼出解锁按钮（02 §4.12 手势表），数秒无操作自动隐藏
  const handleTap = useCallback(() => {
    const store = usePlayerStore.getState();
    if (store.isLocked) {
      setUnlockVisible(true);
      return;
    }
    store.toggleControls();
  }, []);

  // —— 会话切换统一编排（03 §4.8.2/§4.11）：service 内完成 Stopped→DELETE→resolve→
  // setSession→回填；endRestart 在新会话 onLoad（SessionRestartOverlay 覆盖加载全程）。
  // 重启中互斥（重复点击/蜂窝事件忽略）；resolve 失败（重试后仍败）→ finish 收尾退出播放 ——
  const runSwitch = useCallback(
    async (action: () => Promise<PlaybackSession | null>): Promise<void> => {
      const store = usePlayerStore.getState();
      if (store.isRestartingSession || store.session === null) {
        return;
      }
      try {
        await action();
      } catch (err) {
        // 旧会话已在重启第 2–3 步终止，不可续用：收尾退出播放（03 §4.11）
        console.warn('[播放页] 会话切换失败:', err instanceof Error ? err.message : '');
        await finishOnce('error');
        ToastAndroid.show('切换失败，请重新播放', ToastAndroid.SHORT);
        navigation.goBack();
      }
    },
    [finishOnce, navigation]
  );

  // —— 蜂窝自动降档（03 §4.9）：netinfo type 变化时判定；断网（none）跳过；自动降档与
  // 恢复均不写 settingsStore（用户档位以 settingsStore.maxBitrateMode 为准，回 WiFi 恢复原档）。
  // 判定逻辑抽取为 evaluateBitrateForConnection 供两处共用：①订阅回调（type 变化去重）；
  // ②重启结束补判——重启期间被 isRestartingSession 挡掉的事件已随 lastTypeRef 更新不再触发，
  // 重启完成后按当前实际网络补判一次（蜂窝降档中重启不丢降档、回 WiFi 恢复不丢档）——
  const evaluateBitrateForConnection = useCallback(
    (type: string) => {
      setConnectionType(type);
      const store = usePlayerStore.getState();
      // 重启中忽略（03 §4.7.1，重启结束后由补判兜底）；直连会话不干预（不自动改走转码）
      if (store.isRestartingSession || store.session === null || store.session.playMethod !== 'Transcode') {
        return;
      }
      const settings = useSettingsStore.getState();
      const targetTier = resolveBitrateTierForNetwork(
        settings.maxBitrateMode,
        type,
        settings.autoDowngradeOnCellular
      );
      // null = 断网过渡态：不触发任何会话动作（wifi→飞行模式→cellular 的 none 必须排除）
      if (targetTier === null) {
        return;
      }
      const targetBps = BITRATE_TIER_MAP[targetTier].bitrateBps;
      // 目标档位 ≠ 当前生效档位（session.maxBitrateBps 反查）才重启
      if (store.session.maxBitrateBps === undefined || store.session.maxBitrateBps === targetBps) {
        return;
      }
      const currentSession = store.session;
      void runSwitch(() => playbackService.switchBitrate(currentSession, targetTier));
    },
    [runSwitch]
  );

  useEffect(() => {
    const lastTypeRef = { current: null as string | null };
    const unsubscribe = NetInfo.addEventListener((state) => {
      const type = state.type;
      // 仅 connectionType 变化时执行（去抖动；初始回调与同 type 重复事件跳过）
      if (lastTypeRef.current === type) {
        return;
      }
      lastTypeRef.current = type;
      evaluateBitrateForConnection(type);
    });
    return () => unsubscribe();
  }, [evaluateBitrateForConnection]);

  // 重启结束（isRestartingSession true→false）后按当前实际网络补判定一次（03 §4.9）
  const prevRestartingRef = useRef(false);
  useEffect(() => {
    const wasRestarting = prevRestartingRef.current;
    prevRestartingRef.current = isRestartingSession;
    if (!wasRestarting || isRestartingSession) {
      return;
    }
    void NetInfo.fetch()
      .then((state) => {
        evaluateBitrateForConnection(state.type);
      })
      .catch(() => {
        // 读取失败静默（下次 type 变化事件再判）
      });
  }, [isRestartingSession, evaluateBitrateForConnection]);

  // 码率选择：先落盘（T4 依赖，唯一入口语义见 03 §4.8.1）再 switchBitrate；直连仅提示
  const handleBitrateSelect = useCallback(
    (tier: BitrateTierKey) => {
      setVisibleMenu('none');
      useSettingsStore.getState().actions.setMaxBitrateMode(tier);
      void runSwitch(async () => {
        const store = usePlayerStore.getState();
        if (store.session === null) {
          return null;
        }
        const newSession = await playbackService.switchBitrate(store.session, tier);
        if (newSession === null) {
          // 直连会话不重启：设置已落盘，下次转码会话生效（03 §4.6.2）
          ToastAndroid.show('直连播放不受码率限制，设置将在下次会话生效', ToastAndroid.SHORT);
        }
        return newSession;
      });
    },
    [runSwitch]
  );

  // 字幕选择：烧录轨进出由 switchSubtitle 判定重启；纯客户端切换（null）已由 service 更新选中态；
  // M6 本地会话（06 §4.4.2）：仅本地内嵌轨、不发任何服务器请求，纯客户端选中切换
  const handleSubtitleSelect = useCallback(
    (track: SubtitleTrack | null) => {
      setVisibleMenu('none');
      const store = usePlayerStore.getState();
      if (store.session?.local === true) {
        store.setActiveSubtitle(track === null ? null : track.streamIndex);
        return;
      }
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

  // 音轨选择：直连走 ExoPlayer selectedAudioTrack 即时生效（props 驱动）；转码经会话重启；
  // M6 本地会话同直连（ExoPlayer 本地内嵌轨选择，纯客户端操作，06 §4.4.2）
  const handleAudioSelect = useCallback(
    (track: AudioTrack) => {
      setVisibleMenu('none');
      const store = usePlayerStore.getState();
      if (store.session === null) {
        return;
      }
      if (store.session.playMethod === 'DirectPlay' || store.session.local === true) {
        store.setActiveAudio(track.streamIndex);
        return;
      }
      const currentSession = store.session;
      void runSwitch(() => playbackService.switchAudioTrack(currentSession, track));
    },
    [runSwitch]
  );

  // —— 错误重试：finish 旧会话（起点取出错时位置而非 0）→ 重新 resolve → 就地替换会话 ——
  const retry = useCallback(() => {
    void (async () => {
      const store = usePlayerStore.getState();
      const currentPosition = store.positionMs;
      // 码率保持：旧会话生效码率随重试沿用（蜂窝降档态重试不抬升回用户档位，03 §4.9；
      // 直连旧会话 undefined → resolve 回落 settingsStore 用户档位）
      const previousMaxBitrateBps = store.session?.maxBitrateBps;
      await finishOnce('error');
      endReasonRef.current = null; // 新会话允许再次收尾
      // 旧会话已收尾：从 store 摘除，避免 resolve 的防御式收尾重复上报（03 §4.6.2）
      store.setSession(null);
      try {
        const newSession = await playbackService.resolve(initialSession.itemId, {
          startPositionMs: currentPosition,
          maxBitrateBps: previousMaxBitrateBps,
        });
        store.setSession(newSession);
        store.setStatus('loading');
      } catch (err) {
        store.setStatus('error');
        if (err instanceof Error) {
          console.warn('[播放页] 重试失败:', err.message);
        }
      }
    })();
  }, [finishOnce, initialSession.itemId]);

  // 退出（控制层返回按钮）：先收尾再 goBack（unmount 清理兜底幂等）
  const exitPlayer = useCallback(() => {
    void (async () => {
      await finishOnce('user_exit');
      navigation.goBack();
    })();
  }, [finishOnce, navigation]);

  // 锁屏/解锁（02 §4.12：上锁屏蔽全部手势与控制层，单击仅呼出解锁按钮）
  const toggleLock = useCallback(() => {
    const store = usePlayerStore.getState();
    store.setLocked(!store.isLocked);
    if (!store.isLocked) {
      store.setControlsVisible(false);
    }
    setUnlockVisible(false);
  }, []);

  // 锁屏解锁按钮的自动隐藏（呼出后数秒无操作收起，与控制层同间隔）
  useEffect(() => {
    if (!isLocked || !unlockVisible) {
      return;
    }
    const timer = setTimeout(() => setUnlockVisible(false), CONTROLS_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [isLocked, unlockVisible]);

  // —— 手势回调（GestureLayer）——
  const handleGestureValueChange = useCallback(
    (side: 'left' | 'right', value: number) => {
      if (side === 'left') {
        void PlaybackGestures.setWindowBrightness(value).catch(() => {
          // 静默
        });
        showHud({ kind: 'brightness', value });
      } else {
        void PlaybackGestures.setMusicVolume(value).catch(() => {
          // 静默
        });
        showHud({ kind: 'volume', value });
      }
    },
    [showHud]
  );

  const handleSeekBegin = useCallback(() => {
    // reanimated worklet 模式：经 shared value 向手势线程传起点（React Compiler 静态规则不识别）
    // eslint-disable-next-line react-hooks/immutability
    seekStartMsSV.value = usePlayerStore.getState().positionMs;
  }, [seekStartMsSV]);

  const handleSeekPreview = useCallback(
    (targetMs: number) => {
      showHud({
        kind: 'seek',
        value: targetMs,
        deltaMs: targetMs - usePlayerStore.getState().positionMs,
      });
    },
    [showHud]
  );

  const handleSeekCommit = useCallback(
    (targetMs: number) => {
      seekTo(targetMs);
      hideHudLater();
    },
    [seekTo, hideHudLater]
  );

  const isPlaying = status === 'playing';
  // M6 本地会话（06 文档 §4.4.2 控制层降级）：字幕菜单仅本地内嵌轨、音轨菜单用引擎轨、码率按钮隐藏
  const isLocalSession = session.local === true;
  const localSubtitleTracks: SubtitleTrack[] = isLocalSession
    ? engineTextTracks.map((track) => ({
        streamIndex: track.index,
        title: track.title ?? (track.language !== undefined ? track.language : `字幕 ${track.index + 1}`),
        language: track.language,
        isExternal: true,
        burnIn: false,
      }))
    : session.subtitleList;
  const localAudioTracks: AudioTrack[] = isLocalSession
    ? engineAudioTracks.map((track) => ({
        streamIndex: track.index,
        title: track.title,
        language: track.language,
      }))
    : session.audioList;
  const source = useMemo(
    () => ({
      uri: session.url,
      // 直连 URL 不带起点，起点由播放器 startPosition 承载（秒；02 §4.3）；转码 HLS 同机制恢复
      startPosition: session.positionMsAtStart / 1000,
      // 外挂文本轨注入（03 §4.8.2）：只注入非烧录轨；uri 用 adapter 已拼好的完整 URL
      textTracks: session.subtitleList
        .filter((track) => !track.burnIn && track.vttUrl !== undefined)
        .map((track) => ({
          title: track.title ?? `字幕 ${track.streamIndex + 1}`,
          // 服务器 Language 为 ISO 639-2 三字码（chi），RN Video 类型仅收 ISO 639-1 两字码；
          // 选中经 index 精确控制，此字段仅辅助引擎展示，原样透传（类型强转登记）
          language: (track.language ?? '') as never,
          type: TextTrackType.VTT,
          uri: track.vttUrl as string,
        })),
    }),
    [session.url, session.positionMsAtStart, session.subtitleList]
  );

  // selectedTextTrack 派生（03 §4.8.2；streamIndex → 本地数组序号的映射只在此处发生）：
  // 烧录中/未开字幕 → disabled；否则按非烧录注入序号选中；
  // M6 本地会话：引擎内嵌轨序号即选中序号（无服务器外挂注入，06 §4.4.2）
  const selectedTextTrack = useMemo(() => {
    if (session.local === true) {
      if (activeSubtitleStreamIndex === null) {
        return { type: SelectedTrackType.DISABLED };
      }
      return { type: SelectedTrackType.INDEX, value: activeSubtitleStreamIndex };
    }
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
  }, [session.local, session.subtitleList, activeSubtitleStreamIndex]);

  // selectedAudioTrack 派生（03 §4.8.2）：引擎 audioTracks 可按 language/title 匹配时优先
  // 精确匹配（onLoad 校正缓存）；否则按「服务器 Audio 子序列序号=引擎序号」假设直连生效；
  // M6 本地会话：选中值即引擎音轨序号（ExoPlayer 本地内嵌轨，06 §4.4.2）
  const selectedAudioTrack = useMemo(() => {
    if (activeAudioStreamIndex === null) {
      return undefined;
    }
    if (session.local === true) {
      return { type: SelectedTrackType.INDEX, value: activeAudioStreamIndex };
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
  }, [session.audioList, session.local, activeAudioStreamIndex, engineAudioTracks]);

  // 当前生效档位（session.maxBitrateBps 反查；直连回退用户设置档位）
  const activeBitrateTier = useMemo<BitrateTierKey>(() => {
    const bps = session.maxBitrateBps;
    if (bps === undefined) {
      return settingsMaxBitrateMode;
    }
    return BITRATE_TIER_LIST.find((tier) => tier.bitrateBps === bps)?.key ?? settingsMaxBitrateMode;
  }, [session.maxBitrateBps, settingsMaxBitrateMode]);
  // 蜂窝强制降档生效中（提示用）：生效档位=蜂窝档但用户档位非该档
  const cellularForced =
    connectionType === 'cellular' &&
    activeBitrateTier === CELLULAR_BITRATE_TIER &&
    settingsMaxBitrateMode !== CELLULAR_BITRATE_TIER;

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={status !== 'playing'}
        progressUpdateInterval={500}
        selectedTextTrack={selectedTextTrack}
        selectedAudioTrack={selectedAudioTrack}
        preventsDisplaySleepDuringVideoPlayback
        onLoad={handleLoad}
        onProgress={handleProgress}
        onEnd={handleEnd}
        onError={handleError}
      />
      {/* 手势层：锁屏或控制层可见时仅保留单击（拖动手势集中在 SeekBar，避免双重 seek） */}
      <GestureLayer
        isLocked={isLocked}
        gesturesEnabled={!controlsVisible}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        brightnessSV={brightnessSV}
        volumeSV={volumeSV}
        seekStartMsSV={seekStartMsSV}
        seekTargetMsSV={seekTargetMsSV}
        durationMs={durationMs}
        seekFullWidthSeconds={SEEK_FULL_WIDTH_SECONDS}
        onTap={handleTap}
        onGestureValueChange={handleGestureValueChange}
        onGestureEnd={hideHudLater}
        onSeekBegin={handleSeekBegin}
        onSeekPreview={handleSeekPreview}
        onSeekCommit={handleSeekCommit}
      />
      {/* 锁屏态：单击呼出解锁按钮（02 §4.12「锁屏时单击仅显示解锁按钮」），数秒无操作自动隐藏 */}
      {isLocked && unlockVisible && (
        <View style={styles.lockBar} pointerEvents="box-none">
          <Pressable style={styles.unlockButton} onPress={toggleLock}>
            <Text style={styles.unlockText}>🔓 解锁</Text>
          </Pressable>
        </View>
      )}
      {/* 控制层（未锁屏且可见时；本地会话隐藏码率按钮，06 §4.4.2） */}
      {!isLocked && controlsVisible && (
        <ControlOverlay
          title={session.name ?? ''}
          isPlaying={isPlaying}
          positionMs={positionMs}
          bufferedMs={bufferedMs}
          durationMs={durationMs}
          onExit={exitPlayer}
          onToggleLock={toggleLock}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onOpenSubtitleMenu={() => setVisibleMenu('subtitle')}
          onOpenAudioTrackMenu={() => setVisibleMenu('audio')}
          onOpenBitrateMenu={() => setVisibleMenu('bitrate')}
          showBitrate={!isLocalSession}
        />
      )}
      {/* 三菜单（互斥；isRestartingSession 期间由下方浮层整体遮挡） */}
      {visibleMenu === 'subtitle' && (
        <SubtitleMenu
          tracks={localSubtitleTracks}
          activeStreamIndex={activeSubtitleStreamIndex}
          onSelect={handleSubtitleSelect}
          onClose={() => setVisibleMenu('none')}
        />
      )}
      {visibleMenu === 'audio' && (
        <AudioTrackMenu
          tracks={localAudioTracks}
          activeStreamIndex={activeAudioStreamIndex}
          onSelect={handleAudioSelect}
          onClose={() => setVisibleMenu('none')}
        />
      )}
      {visibleMenu === 'bitrate' && (
        <BitrateMenu
          activeTier={activeBitrateTier}
          cellularForced={cellularForced}
          onSelect={handleBitrateSelect}
          onClose={() => setVisibleMenu('none')}
        />
      )}
      <GestureHud hud={hud} />
      {/* 会话重启浮层（03 §4.8.1：屏蔽重复点击，onLoad 后由 endRestart 收起） */}
      <SessionRestartOverlay />
      {/* 加载态 */}
      {status === 'loading' && (
        <View style={styles.centerLayer} pointerEvents="none">
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}
      {/* 错误态 + 重试（02 §4.14：从出错位置继续而非从头；转码文案区分，03 §4.11） */}
      {status === 'error' && (
        <View style={styles.errorLayer}>
          <Text style={styles.errorText}>
            {session.playMethod === 'Transcode' ? '转码播放失败，请重试' : '播放出错，请重试'}
          </Text>
          <Pressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
          <Pressable style={styles.retryButton} onPress={exitPlayer}>
            <Text style={styles.retryText}>退出播放</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  lockBar: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.xl,
  },
  unlockButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: COLORS.posterRadius,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  unlockText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
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
    backgroundColor: COLORS.accent,
    borderRadius: COLORS.posterRadius,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.s,
  },
  retryText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});
