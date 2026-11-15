/**
 * 播放页（M2 文档 §4.12 + M3 文档 §4.8）：编排 Video（react-native-video）+ 生命周期 + 上报。
 * M3 增量：HLS 转码分支（source 直用会话 URL）、外挂文本轨注入与纯客户端切换、烧录字幕/
 * 分辨率/转码音轨三类会话重启编排、三菜单入口、蜂窝自动降档订阅、SessionRestartOverlay。
 * 挂载即锁横屏、退出恢复竖屏；控制层/锁屏/三组手势；AppState 进后台暂停即报；
 * back/unmount 报 Stopped、onEnd 收尾（M2 §4.12 生命周期状态机）。
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
import * as FileSystem from 'expo-file-system/legacy';

import type { AudioTrack, PlaybackSession, SubtitleTrack } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import PlaybackGestures from '../../../modules/expo-playback-gestures';
import PlayerSnapshot from '../../../modules/expo-player-snapshot';
import type { ResolutionTierKey } from '@/constant/resolution';
import {
  CELLULAR_RESOLUTION_TIER,
  DEFAULT_RESOLUTION_TIER,
} from '@/constant/resolution';
import {
  AUTO_NEXT_RESTART_NOTICE,
  CONTROLS_AUTO_HIDE_MS,
  DEFAULT_SUBTITLE_LANGUAGE,
  SEEK_FULL_WIDTH_SECONDS,
} from '@/constant/playback';
import { useImmersiveAccent } from '@/component/useTheme';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { errorMessageOf } from '@/infra/error';
import { ControlOverlay } from '@/page/player/components/ControlOverlay';
import { GestureHud, type HudState } from '@/page/player/components/GestureHud';
import { GestureLayer } from '@/page/player/components/GestureLayer';
import { PlayerSettingsDrawer } from '@/page/player/components/PlayerSettingsDrawer';
import { SessionRestartOverlay } from '@/page/player/components/SessionRestartOverlay';
import { SpeedMenu } from '@/page/player/components/SpeedMenu';
import type { RootStackParamList } from '@/page/navigation/types';
import { photoService } from '@/service/PhotoService';
import { ProgressService } from '@/service/ProgressService';
import { playbackService } from '@/service/PlaybackService';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { abLoopSeekTarget, advanceAbLoop, type AbLoop } from '@/util/abLoop';
import { formatClock } from '@/util/format';
import { resolveResolutionTierForNetwork } from '@/util/resolution';
import { selectAutoSubtitleStreamIndex } from '@/util/subtitleSelect';
import { sanitizedForLog } from '@/util/sanitize';
import type { PlaybackEndReason } from '@/util/resume';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** HUD 延迟隐藏（手势结束后气泡停留时长） */
const HUD_HIDE_DELAY_MS = 600;

/** 控制层菜单显隐（设置抽屉与倍速菜单互斥，none=全关） */
type VisibleMenu = 'none' | 'more' | 'speed';

/**
 * 起播默认字幕策略（M3 §4.8.3 + M4 §4.5 匹配定稿，仅首次起播/连播新集执行）：
 * 仅在可外挂注入的文本轨中匹配——非烧录且 vttUrl 已产出（DeliveryMethod 缺省/Embed 的轨
 * 无 vttUrl、播放器无法加载，命中会造成「高亮已选而画面无字幕」）；偏好语言经
 * normalizeSubtitleLang 归一化后与轨语言等值比较（M4 §4.5：前缀法匹配不到 zh/Chinese
 * 形态的中文轨）→ isDefault → isForced；无命中不开启字幕。
 * 烧录轨不自动激活（烧录只由用户手动选择触发，减少转码触发面）。
 */
function autoSelectSubtitleStreamIndex(session: PlaybackSession): number | null {
  const preferred = useSettingsStore.getState().preferredSubtitleLang ?? DEFAULT_SUBTITLE_LANGUAGE;
  return selectAutoSubtitleStreamIndex(session.subtitleList, preferred);
}

export function PlayerScreen() {
  const immersiveAccent = useImmersiveAccent();
  const tr = useT();
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
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const subtitleDelayMs = usePlayerStore((state) => state.subtitleDelayMs);
  const audioDelayMs = usePlayerStore((state) => state.audioDelayMs);
  const videoAspect = usePlayerStore((state) => state.videoAspect);
  const activeSubtitleStreamIndex = usePlayerStore((state) => state.activeSubtitleStreamIndex);
  const activeAudioStreamIndex = usePlayerStore((state) => state.activeAudioStreamIndex);
  // 会话重启中（SessionRestartOverlay 自行订阅渲染；本页用于重启结束后的网络补判）
  const isRestartingSession = usePlayerStore((state) => state.isRestartingSession);
  const settingsMaxResolutionTier = useSettingsStore((state) => state.maxResolutionTier);

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
  /** 锁屏态解锁按钮显隐（单击呼出后自动隐藏，M2 §4.12「单击仅显示解锁按钮」） */
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
   * 引擎内嵌文本轨列表（M6 本地会话消费，M6 文档 §4.4.2）：本地 fileUri 会话的字幕
   * 仅来自容器内嵌轨（react-native-video onLoad textTracks），无服务器外挂 vtt。
   */
  const [engineTextTracks, setEngineTextTracks] = useState<
    { index: number; title?: string; language?: string }[]
  >([]);
  /** AB 循环区间（null=未设；bMs=null=仅 A 点）；按会话 ID 键控——换会话自然失效，ref 镜像供 handleProgress */
  const [abLoopEntry, setAbLoopEntry] = useState<{ sessionId: string; loop: AbLoop } | null>(null);
  const abLoopRef = useRef<{ sessionId: string; loop: AbLoop } | null>(null);
  const abLoop =
    abLoopEntry !== null && abLoopEntry.sessionId === session.playSessionId ? abLoopEntry.loop : null;
  /** 画中画态（PiP 期间隐藏全部浮层；ref 供 AppState 后台守卫） */
  const [isPip, setIsPip] = useState(false);
  const pipRef = useRef(false);
  /** 进 PiP 请求时刻：状态回调可能晚于 AppState background，宽限期内不暂停 */
  const pipEnterAtRef = useRef(0);
  /** 旋转切换：默认横屏（进页锁定），点按切竖屏锁 */
  const [isPortrait, setIsPortrait] = useState(false);
  /** 截图防重入（原生抓帧 + 入相册为异步链路） */
  const snapshotBusyRef = useRef(false);

  // —— 进页初始化：store 会话 + 状态（首次起播：选中态重置 + 默认字幕选轨，M3 §4.8.3）——
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

  // 挂载即锁横屏、退出恢复竖屏（M2 §4.12）
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
    // 窗口亮度：-1 表示跟随系统（M2 §4.8 契约），此时真实亮度无法经本模块获知
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

  // —— unmount 收尾：报 Stopped + 亮度恢复跟随系统 + 清 store（M2 §4.8/§4.12）——
  useEffect(
    () => () => {
      void finishOnce(endReasonRef.current ?? 'user_exit').catch(() => {
        // 收尾失败静默（Stopped 重试逻辑在 service 内）
      });
      // 窗口亮度恢复 -1 跟随系统（M2 §4.8）
      void PlaybackGestures.setWindowBrightness(-1).catch(() => {
        // 静默
      });
      usePlayerStore.getState().reset();
    },
    // 仅卸载时执行一次收尾
    [finishOnce]
  );

  // —— AppState：进后台 → 立即暂停并即时上报一次（设计文档 §7.2/§11）；回前台不自动恢复 ——
  // 暂停 ≠ 退出：不停会话（转码分片由服务器会话超时兜底，M3 §4.6.3/§7 风险 8）
  // PiP 例外：小窗仍可见，进后台不暂停；回前台按 store 重新对齐 native（PiP 窗内按钮只改 native 态）
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const store = usePlayerStore.getState();
      if (state === 'background') {
        if (pipRef.current || Date.now() - pipEnterAtRef.current < 2000) {
          return;
        }
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

  // —— Video 事件（M2 §4.5 编排表 + M3 §4.8.2）——
  const handleLoad = useCallback(
    (data: OnLoadData) => {
      const store = usePlayerStore.getState();
      // 实际起点（startPosition 生效后的当前帧位置）；时长一并回填
      const startMs = data.currentTime * 1000;
      store.updateProgress(startMs, 0, data.duration * 1000);
      store.setStatus('playing');
      // 引擎音轨缓存（M3 §4.8.2 音轨精确匹配的候选；selectedAudioTrack 派生消费）
      setEngineAudioTracks(data.audioTracks.map((track) => ({ index: track.index, title: track.title, language: track.language })));
      // M6：引擎内嵌文本轨缓存（本地会话字幕菜单数据源，M6 §4.4.2 控制层降级）
      setEngineTextTracks(
        (data.textTracks ?? []).map((track) => ({ index: track.index, title: track.title, language: track.language }))
      );
      // 会话重启完成（M3 §4.8.2：onLoad → begin → endRestart）
      if (store.isRestartingSession) {
        store.endRestart();
      }
      const currentSession = store.session ?? initialSession;
      void (async () => {
        try {
          // Playing 上报携带实际起点（M2 §4.13 时序：PositionTicks=起点；重启后带新 PlaySessionId）
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
    // 日志脱敏（M2 §4.3/§4.14）：errorString 透传 ExoPlayer 异常文本，网络/403 场景
    // 可能含带 api_key 的完整播放 URL，统一经 sanitizedForLog 处理后再留痕
    console.warn(
      '[播放页] 播放器错误:',
      sanitizedForLog(error.error?.errorString ?? '未知错误')
    );
  }, []);

  const handleEnd = useCallback(() => {
    void (async () => {
      const store = usePlayerStore.getState();
      // 自然播完：按完成时长收尾（服务器判定 + 客户端 ≥95% 兜底双保险，M2 §4.5）
      if (store.durationMs > 0) {
        store.updateProgress(store.durationMs, store.bufferedMs, store.durationMs);
      }
      await finishOnce('natural_end');
      // 自动连播下一集（M4 §4.4）：集数场景 natural_end 后经 getNextUp 换源续播，
      // 进度从 0 起新会话上报；电影等非集内容照旧退出播放页
      const current = store.session ?? initialSession;
      if (current.itemType === 'Episode') {
        try {
          const next = await playbackService.playNextEpisode(current);
          if (next !== null) {
            // 新会话允许再次收尾（连播后再退出仍需报 Stopped）
            endReasonRef.current = null;
            // 先换会话（resetTrackSelection 会同时清重启态），再置重启浮层：
            // 新集 onLoad 时 endRestart 收起（M3 §4.8.2 时序）
            store.setSession(next, { resetTrackSelection: true });
            store.beginRestart(tr(AUTO_NEXT_RESTART_NOTICE));
            // 新集字幕按 M3 §4.8.3 重新自动选轨（音轨由 resetTrackSelection 取默认轨）
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

  // —— 画中画：原生 enterPictureInPicture；浮层显隐随状态回调 ——
  const handleEnterPip = useCallback(() => {
    pipEnterAtRef.current = Date.now();
    videoRef.current?.enterPictureInPicture();
  }, []);

  const handlePipStatus = useCallback((data: { isActive: boolean }) => {
    pipRef.current = data.isActive;
    setIsPip(data.isActive);
    // 退出 PiP：native 可能以旧 startPosition 重建 surface，seek 回 store 当前进度防回退
    if (!data.isActive) {
      videoRef.current?.seek(usePlayerStore.getState().positionMs / 1000);
    }
  }, []);

  // —— 旋转切换：横屏/竖屏锁互切（退出播放页由 focus 清理恢复跟随系统） ——
  const handleRotate = useCallback(() => {
    const next = !isPortrait;
    setIsPortrait(next);
    void ScreenOrientation.lockAsync(
      next
        ? ScreenOrientation.OrientationLock.PORTRAIT
        : ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {
      // 锁屏失败（个别 ROM）静默
    });
  }, [isPortrait]);

  // —— 截图：原生抓帧 → 入系统相册 → 删临时文件；反馈同照片保存口径 ——
  const handleSnapshot = useCallback(() => {
    if (snapshotBusyRef.current) {
      return;
    }
    snapshotBusyRef.current = true;
    void (async () => {
      let fileUri: string | null = null;
      try {
        const path = await PlayerSnapshot.capture();
        fileUri = path.startsWith('file://') ? path : `file://${path}`;
        await photoService.saveFileToGallery(fileUri, false);
        showToast(tr('player.snapshotSaved'), 'info');
      } catch (err) {
        const code = (err as { code?: string }).code;
        showToast(
          errorMessageOf(
            code === 'PHOTO_SAVE_PERMISSION_DENIED' ? 'PHOTO_SAVE_PERMISSION_DENIED' : 'PHOTO_SAVE_FAILED'
          ),
          'error'
        );
      } finally {
        snapshotBusyRef.current = false;
        if (fileUri !== null) {
          void FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {
            // 临时文件清理失败静默（cacheDir 系统可回收）
          });
        }
      }
    })();
  }, [tr]);

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

  // 单击手势：切换控制层显隐；锁屏时单击仅呼出解锁按钮（M2 §4.12 手势表），数秒无操作自动隐藏
  const handleTap = useCallback(() => {
    const store = usePlayerStore.getState();
    if (store.isLocked) {
      setUnlockVisible(true);
      return;
    }
    store.toggleControls();
  }, []);

  // 双击手势：切换播放/暂停（复用 togglePlay 的进度上报）+ 闪现状态图标反馈。
  // 锁屏态手势层已不挂双击，此处再兜底屏蔽；加载/错误态不响应（togglePlay 本就只处理 playing/paused）
  const handleDoubleTap = useCallback(() => {
    const store = usePlayerStore.getState();
    if (store.isLocked) {
      return;
    }
    const status = store.status;
    if (status !== 'playing' && status !== 'paused') {
      return;
    }
    togglePlay();
    // 图标取切换后状态：原 playing→暂停（pause 图标）、原 paused→播放（play 图标）
    showHud({ kind: 'playPause', value: status === 'playing' ? 0 : 1 });
    hideHudLater();
  }, [togglePlay, showHud, hideHudLater]);

  // —— 会话切换统一编排（M3 §4.8.2/§4.11）：service 内完成 Stopped→DELETE→resolve→
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
        // 旧会话已在重启第 2–3 步终止，不可续用：收尾退出播放（M3 §4.11）
        console.warn('[播放页] 会话切换失败:', err instanceof Error ? err.message : '');
        await finishOnce('error');
        ToastAndroid.show(tr('player.switchFailed'), ToastAndroid.SHORT);
        navigation.goBack();
      }
    },
    [finishOnce, navigation, tr]
  );

  // 用户本次会话手动选过分辨率：蜂窝自动降档仅作默认，不再覆盖手动结果（网络切换时复位）
  const manualResolutionOverrideRef = useRef(false);

  // —— 蜂窝自动降分辨率（M3 §4.9）：netinfo type 变化时判定；断网（none）跳过；自动降档与
  // 恢复均不写 settingsStore（用户档位以 settingsStore.maxResolutionTier 为准，回 WiFi 恢复原档）。
  // 判定逻辑抽取为 evaluateResolutionForConnection 供两处共用：①订阅回调（type 变化去重）；
  // ②重启结束补判——重启期间被 isRestartingSession 挡掉的事件已随 lastTypeRef 更新不再触发，
  // 重启完成后按当前实际网络补判一次（蜂窝降档中重启不丢降档、回 WiFi 恢复不丢档）——
  const evaluateResolutionForConnection = useCallback(
    (type: string) => {
      setConnectionType(type);
      const store = usePlayerStore.getState();
      // 重启中忽略（M3 §4.7.1，重启结束后由补判兜底）；直连会话不干预（不自动改走转码）
      if (store.isRestartingSession || store.session === null || store.session.playMethod !== 'Transcode') {
        return;
      }
      // 手动选择优先：蜂窝降档只是默认值，用户改过分辨率后本次会话不再自动覆盖
      if (manualResolutionOverrideRef.current) {
        return;
      }
      const settings = useSettingsStore.getState();
      const targetTier = resolveResolutionTierForNetwork(
        settings.maxResolutionTier,
        type,
        settings.autoDowngradeOnCellular
      );
      // null = 断网过渡态：不触发任何会话动作（wifi→飞行模式→cellular 的 none 必须排除）
      if (targetTier === null) {
        return;
      }
      // 目标档位 ≠ 当前生效档位（session.maxResolutionTier）才重启
      const currentTier = store.session.maxResolutionTier ?? DEFAULT_RESOLUTION_TIER;
      if (currentTier === targetTier) {
        return;
      }
      const currentSession = store.session;
      void runSwitch(() => playbackService.switchResolution(currentSession, targetTier));
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
      // 网络切换：蜂窝降档恢复为默认（新网络重新按默认判定）
      manualResolutionOverrideRef.current = false;
      evaluateResolutionForConnection(type);
    });
    return () => unsubscribe();
  }, [evaluateResolutionForConnection]);

  // 重启结束（isRestartingSession true→false）后按当前实际网络补判定一次（M3 §4.9）
  const prevRestartingRef = useRef(false);
  useEffect(() => {
    const wasRestarting = prevRestartingRef.current;
    prevRestartingRef.current = isRestartingSession;
    if (!wasRestarting || isRestartingSession) {
      return;
    }
    void NetInfo.fetch()
      .then((state) => {
        evaluateResolutionForConnection(state.type);
      })
      .catch(() => {
        // 读取失败静默（下次 type 变化事件再判）
      });
  }, [isRestartingSession, evaluateResolutionForConnection]);

  // 分辨率选择：先落盘（T4 依赖，唯一入口语义见 M3 §4.8.1）再 switchResolution；直连仅提示
  const handleResolutionSelect = useCallback(
    (tier: ResolutionTierKey) => {
      // 手动选择优先于蜂窝自动降档（本次会话内保持）
      manualResolutionOverrideRef.current = true;
      useSettingsStore.getState().actions.setMaxResolutionTier(tier);
      void runSwitch(async () => {
        const store = usePlayerStore.getState();
        if (store.session === null) {
          return null;
        }
        const newSession = await playbackService.switchResolution(store.session, tier);
        if (newSession === null) {
          // 直连会话不重启：设置已落盘，下次转码会话生效（M3 §4.6.2）
          ToastAndroid.show(tr('player.directResolutionNotice'), ToastAndroid.SHORT);
        }
        return newSession;
      });
    },
    [runSwitch, tr]
  );

  // 字幕选择：烧录轨进出由 switchSubtitle 判定重启；纯客户端切换（null）已由 service 更新选中态；
  // M6 本地会话（M6 §4.4.2）：仅本地内嵌轨、不发任何服务器请求，纯客户端选中切换
  const handleSubtitleSelect = useCallback(
    (track: SubtitleTrack | null) => {
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
  // M6 本地会话同直连（ExoPlayer 本地内嵌轨选择，纯客户端操作，M6 §4.4.2）
  const handleAudioSelect = useCallback(
    (track: AudioTrack) => {
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
      // 分辨率保持：旧会话生效档位随重试沿用（蜂窝降档态重试不抬升回用户档位，M3 §4.9；
      // 直连旧会话 undefined → resolve 回落 settingsStore 用户档位）
      const previousMaxResolutionTier = store.session?.maxResolutionTier;
      await finishOnce('error');
      endReasonRef.current = null; // 新会话允许再次收尾
      // 旧会话已收尾：从 store 摘除，避免 resolve 的防御式收尾重复上报（M3 §4.6.2）
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
          console.warn('[播放页] 重试失败:', err.message);
        }
      }
    })();
  }, [finishOnce, initialSession.itemId]);

  // 退出（控制层返回按钮）：立即 goBack，收尾交 unmount 清理兜底（与系统返回同路径）。
  // 不 await finishOnce——Stopped/markPlayed 是网络请求，先收尾再返回会阻塞 UI 造成卡顿；
  // unmount 清理已带 endReasonRef 幂等兜底，返回后后台收尾即可
  const exitPlayer = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // 锁屏/解锁（M2 §4.12：上锁屏蔽全部手势与控制层，单击仅呼出解锁按钮）
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
  // 屏幕宽高比（设置抽屉视频页）：16:9/4:3 为居中定比盒内拉伸；其余全屏适配
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
  // M6 本地会话（M6 文档 §4.4.2 控制层降级）：字幕菜单仅本地内嵌轨、音轨菜单用引擎轨、分辨率按钮隐藏
  const isLocalSession = session.local === true;
  const localSubtitleTracks: SubtitleTrack[] = isLocalSession
    ? engineTextTracks.map((track) => ({
        streamIndex: track.index,
        title:
          track.title ??
          (track.language !== undefined
            ? track.language
            : tr('player.subtitleFallback', { index: track.index + 1 })),
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
      // 直连 URL 不带起点，起点由播放器 startPosition 承载（毫秒：Android 直接传给
      // ExoPlayer setMediaSource、iOS 内部 /1000 转秒；M2 §4.3）；转码 HLS 同机制恢复
      startPosition: session.positionMsAtStart,
      // 外挂文本轨注入（M3 §4.8.2）：只注入非烧录轨；uri 用 adapter 已拼好的完整 URL
      textTracks: session.subtitleList
        .filter((track) => !track.burnIn && track.vttUrl !== undefined)
        .map((track) => ({
          title: track.title ?? tr('player.subtitleFallback', { index: track.streamIndex + 1 }),
          // 服务器 Language 为 ISO 639-2 三字码（chi），RN Video 类型仅收 ISO 639-1 两字码；
          // 选中经 index 精确控制，此字段仅辅助引擎展示，原样透传（类型强转登记）
          language: (track.language ?? '') as never,
          type: TextTrackType.VTT,
          uri: track.vttUrl as string,
        })),
    }),
    [session.url, session.positionMsAtStart, session.subtitleList, tr]
  );

  // selectedTextTrack 派生（M3 §4.8.2；streamIndex → 本地数组序号的映射只在此处发生）：
  // 烧录中/未开字幕 → disabled；否则按非烧录注入序号选中；
  // M6 本地会话：引擎内嵌轨序号即选中序号（无服务器外挂注入，M6 §4.4.2）
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

  // M8 音画同步延时：字幕延时仅在线外挂文本轨可调（烧录已进画面、本地内嵌轨非 sideload 路径）
  const activeSubtitleTrack = session.subtitleList.find(
    (track) => track.streamIndex === activeSubtitleStreamIndex
  );
  const subtitleDelayDisabled =
    isLocalSession ||
    activeSubtitleStreamIndex === null ||
    activeSubtitleTrack?.burnIn === true ||
    activeSubtitleTrack?.vttUrl === undefined;

  // selectedAudioTrack 派生（M3 §4.8.2）：引擎 audioTracks 可按 language/title 匹配时优先
  // 精确匹配（onLoad 校正缓存）；否则按「服务器 Audio 子序列序号=引擎序号」假设直连生效；
  // M6 本地会话：选中值即引擎音轨序号（ExoPlayer 本地内嵌轨，M6 §4.4.2）
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

  // 当前生效档位（session.maxResolutionTier；直连回退用户设置档位）
  const activeResolutionTier: ResolutionTierKey =
    session.maxResolutionTier ?? settingsMaxResolutionTier;
  // 蜂窝强制降档生效中（提示用）：生效档位=蜂窝档但用户档位非该档
  const cellularForced =
    connectionType === 'cellular' &&
    activeResolutionTier === CELLULAR_RESOLUTION_TIER &&
    settingsMaxResolutionTier !== CELLULAR_RESOLUTION_TIER;

  return (
    <View style={styles.container}>
      <View style={styles.videoWrap} pointerEvents="none">
        <Video
          ref={videoRef}
          source={source}
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
          onPictureInPictureStatusChanged={handlePipStatus}
        />
      </View>
      {/* PiP 期间只留视频本体（系统小窗不叠自绘浮层） */}
      {!isPip && (
        <>
          {/* 手势层：控制层可见时拖动仍可调进度/亮度/音量；锁屏时仅保留单击 */}
          <GestureLayer
            isLocked={isLocked}
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            brightnessSV={brightnessSV}
            volumeSV={volumeSV}
            seekStartMsSV={seekStartMsSV}
            seekTargetMsSV={seekTargetMsSV}
            durationMs={durationMs}
            seekFullWidthSeconds={SEEK_FULL_WIDTH_SECONDS}
            onTap={handleTap}
            onDoubleTap={handleDoubleTap}
            onGestureValueChange={handleGestureValueChange}
            onGestureEnd={hideHudLater}
            onSeekBegin={handleSeekBegin}
            onSeekPreview={handleSeekPreview}
            onSeekCommit={handleSeekCommit}
          />
          {/* 锁屏态：单击呼出解锁按钮（M2 §4.12「锁屏时单击仅显示解锁按钮」），数秒无操作自动隐藏 */}
          {isLocked && unlockVisible && (
            <View style={styles.lockBar} pointerEvents="box-none">
              <Pressable
                style={styles.unlockButton}
                onPress={toggleLock}
                accessibilityLabel={tr('player.unlock')}
              >
                <AppIcon name="unlock" size={16} color={COLORS.textPrimary} />
                <Text style={styles.unlockText}>{tr('player.unlock')}</Text>
              </Pressable>
            </View>
          )}
          {/* 控制层（未锁屏且可见时；字幕/音轨/分辨率入口收进更多菜单） */}
          {!isLocked && controlsVisible && (
            <ControlOverlay
              title={session.name ?? ''}
              isPlaying={isPlaying}
              isLocked={isLocked}
              isPortrait={isPortrait}
              positionMs={positionMs}
              bufferedMs={bufferedMs}
              durationMs={durationMs}
              abLoop={abLoop}
              playbackSpeed={playbackSpeed}
              onExit={exitPlayer}
              onToggleLock={toggleLock}
              onTogglePlay={togglePlay}
              onSeek={seekTo}
              onOpenMoreMenu={() => setVisibleMenu('more')}
              onOpenSpeedMenu={() => setVisibleMenu('speed')}
              onEnterPip={handleEnterPip}
              onAbLoop={handleAbLoop}
              onSnapshot={handleSnapshot}
              onRotate={handleRotate}
            />
          )}
          {/* 倍速菜单（底部 1.0X 按钮入口；选中即应用并关闭） */}
          {visibleMenu === 'speed' && (
            <SpeedMenu
              current={playbackSpeed}
              onSelect={(speed) => {
                usePlayerStore.getState().setPlaybackSpeed(speed);
                setVisibleMenu('none');
              }}
              onClose={() => setVisibleMenu('none')}
            />
          )}
          {/* 设置抽屉（右上更多入口；视频/音频/字幕三页签，分辨率并入视频页） */}
          {visibleMenu === 'more' && (
            <PlayerSettingsDrawer
              onClose={() => setVisibleMenu('none')}
              aspect={videoAspect}
              onAspect={(aspect) => usePlayerStore.getState().setVideoAspect(aspect)}
              showResolution={!isLocalSession && session.playMethod === 'Transcode'}
              activeTier={activeResolutionTier}
              sourceHeight={session.sourceHeight}
              cellularForced={cellularForced}
              onResolution={handleResolutionSelect}
              audioTracks={localAudioTracks}
              activeAudioIndex={activeAudioStreamIndex}
              onAudioSelect={handleAudioSelect}
              subtitleTracks={localSubtitleTracks}
              activeSubtitleIndex={activeSubtitleStreamIndex}
              onSubtitleSelect={handleSubtitleSelect}
              audioDelayMs={audioDelayMs}
              onAudioDelay={(ms) => usePlayerStore.getState().setAudioDelay(ms)}
              subtitleDelayMs={subtitleDelayMs}
              onSubtitleDelay={(ms) => usePlayerStore.getState().setSubtitleDelay(ms)}
              subtitleDelayDisabled={subtitleDelayDisabled}
            />
          )}
          <GestureHud hud={hud} />
          {/* 会话重启浮层（M3 §4.8.1：屏蔽重复点击，onLoad 后由 endRestart 收起） */}
          <SessionRestartOverlay />
          {/* 加载态（重启浮层自带转圈与文案，同时成立时避免叠出两个圈） */}
          {status === 'loading' && !isRestartingSession && (
            <View style={styles.centerLayer} pointerEvents="none">
              <ActivityIndicator color={immersiveAccent.accent} size="large" />
            </View>
          )}
          {/* 错误态 + 重试（M2 §4.14：从出错位置继续而非从头；转码文案区分，M3 §4.11） */}
          {status === 'error' && (
            <View style={styles.errorLayer}>
              <Text style={styles.errorText}>
                {session.playMethod === 'Transcode'
                  ? tr('player.errorTranscode')
                  : tr('player.errorPlayback')}
              </Text>
              <Pressable style={[styles.retryButton, { backgroundColor: immersiveAccent.accent }]} onPress={retry}>
                <Text style={[styles.retryText, { color: immersiveAccent.accentOn }]}>
                  {tr('common.retry')}
                </Text>
              </Pressable>
              <Pressable style={[styles.retryButton, { backgroundColor: immersiveAccent.accent }]} onPress={exitPlayer}>
                <Text style={[styles.retryText, { color: immersiveAccent.accentOn }]}>
                  {tr('player.exitPlayback')}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
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
  lockBar: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    left: SPACING.l,
  },
  unlockButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: COLORS.posterRadius,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
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
    borderRadius: COLORS.posterRadius,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.s,
  },
  retryText: { fontSize: FONT_SIZE.body },
});
