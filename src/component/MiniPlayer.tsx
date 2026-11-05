/**
 * 全局迷你播放条（M5 文档 §4.10；设计文档 §7.5/§10.1「全局常驻」）。
 * 挂载位置：根布局（NavigationContainer 同级的绝对定位浮层）——保证三个 Tab 与已推入
 * Root Stack 的库/详情页都可见。显隐 = engineReady && status !== 'idle' && currentTrack != null
 * 且当前路由 ∉ MINI_PLAYER_HIDDEN_ROUTES。
 * 视觉（参考稿）：整宽贴边白条（无圆角/外边距），封面 + 曲名/副标题 + 圆形描边播放键 +
 * 停止（关闭播放/迷你条）+ 队列；所有控制用主题 accent。
 * 交互：仅曲名区可左右拖拽（封面不可拖），拖动时当前曲名跟手、下一首/上一首名称从两侧滑入；
 * 拖到预览名称露出足够长度后松手才切歌，未达阈值松手回弹；点击曲名/封面进 NowPlaying；
 * 队列按钮原地弹半屏队列面板（QueueSheet），不进入 NowPlaying；
 * 队列仅剩当前曲时该位置变为收藏按钮（空心未收藏 / 实心红已收藏，点击切换）。
 * 定位：Tab 页紧贴底部菜单栏上沿（菜单栏高度 = bottom-tabs 默认 49 + 安全区底）；
 * 无菜单栏的 Root Stack 页紧贴屏幕下边框（安全区落差转成条内 padding）。
 */
/* eslint-disable react-hooks/immutability -- 手势 worklet 通过 shared value 的 .value 跨线程写入
   拖动位移，React Compiler 静态规则不识别该运行时语义（与播放页 GestureLayer 同款豁免） */
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/component/AppIcon';
import { FavoriteButton } from '@/component/FavoriteButton';
import { QueueSheet } from '@/component/QueueSheet';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { MINI_PLAYER_HIDDEN_ROUTES, ROUTES } from '@/constant/navigation';
import { audioService, type AdjacentTrackPreview } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { navigationRef } from '@/page/navigation/navigationRef';

/** 迷你条总高（含顶部描边，列表页底部 padding 补偿可复用，05 文档 §4.10） */
export const MINI_PLAYER_TOTAL_HEIGHT = 60;

/**
 * 底部 Tab 栏基准高度：@react-navigation/bottom-tabs 默认 49（TABBAR_HEIGHT_UIKIT），
 * 实际高度 = 49 + 安全区底部（MiniPlayer 与之贴合，不能继续沿用旧的 56 经验值）。
 */
const TAB_BAR_BASE_HEIGHT = 49;

/** Tab 路由集合（这些路由底部有菜单栏，迷你条要贴在栏上沿；其余 Root Stack 页贴屏幕底） */
const TAB_ROUTE_NAMES: readonly string[] = [
  ROUTES.TAB_LIBRARIES,
  ROUTES.TAB_MEDIA_SERVER,
  ROUTES.TAB_SETTINGS,
];

/** 曲名区左右拖：水平激活阈值 / 垂直失效阈值（dp） */
const SWIPE_ACTIVATE_OFFSET = 12;
const SWIPE_FAIL_OFFSET = 16;
/**
 * 松手提交阈值：视口宽度的 40%，且不低于 56dp —— 相邻曲名必须滑入足够长度，
 * 松手才真正切歌；否则回弹不切。
 */
const SWIPE_COMMIT_RATIO = 0.4;
const SWIPE_COMMIT_MIN = 56;

/**
 * 列表页底部让位（05 文档 §4.10）：音频活跃时返回迷你条高度、否则 0；
 * 组件内部订阅，停止播放后立即归零（不残留白条）。
 */
export function useMiniPlayerPadding(): number {
  const engineReady = usePlayerStore((state) => state.audio.engineReady);
  const status = usePlayerStore((state) => state.audio.status);
  const currentTrack = usePlayerStore((state) => state.audio.currentTrack);
  // 与 MiniPlayer 显隐同口径（必须带 currentTrack）：stop() 复位后可能有晚到的
  // IsPlayingChanged(false) 把 status 改成 paused，只看 status 会让让位 padding 残留出白条
  return engineReady && status !== 'idle' && currentTrack !== null ? MINI_PLAYER_TOTAL_HEIGHT : 0;
}

export function MiniPlayer() {
  const t = useTheme();
  const styles = createStyles(t);
  const engineReady = usePlayerStore((state) => state.audio.engineReady);
  const status = usePlayerStore((state) => state.audio.status);
  const currentTrack = usePlayerStore((state) => state.audio.currentTrack);
  const queueLength = usePlayerStore((state) => state.audio.queueLength);
  // 当前路由名（根布局浮层在 NavigationContainer 之外，经 navigationRef 订阅路由状态）；
  // 懒初始化避免首帧 routeName=undefined 时把迷你条先画到屏幕底部再跳回菜单栏上沿
  const [routeName, setRouteName] = useState<string | undefined>(
    () => navigationRef.current?.getCurrentRoute()?.name
  );
  const insets = useSafeAreaInsets();
  /** 相邻曲预览（下一首/上一首名称，随当前曲/队列长度刷新） */
  const [adjacent, setAdjacent] = useState<{
    previous?: AdjacentTrackPreview;
    next?: AdjacentTrackPreview;
  }>({});
  /**
   * 已提交切歌、等待原生 MediaItemTransition 生效的乐观预览：松手后先显示目标曲名，
   * 图片/播放键进入 loading，避免旧曲名残留到事件回流（约 1s）。
   */
  const [pendingPreview, setPendingPreview] = useState<AdjacentTrackPreview | null>(null);

  useEffect(() => {
    const refresh = () => {
      setRouteName(navigationRef.current?.getCurrentRoute()?.name);
    };
    refresh();
    const unsubscribe = navigationRef.addListener('state', refresh);
    return unsubscribe;
  }, []);

  // 相邻曲名称（拖动预览用）：切歌/队列增删后重取；失败静默（只是少预览，不影响切歌）
  useEffect(() => {
    let cancelled = false;
    void audioService
      .getAdjacentTrackPreviews()
      .then((previews) => {
        if (!cancelled) {
          setAdjacent(previews);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, queueLength]);

  // 乐观切换态：pending 尚未成为当前曲时生效（id 相同立即结束 loading，避免多等一跳）
  const switching = pendingPreview !== null && pendingPreview.id !== currentTrack?.id;

  // pending 兜底清理：切歌失败/队列异常时最多 loading 2.5s，避免一直停在 loading
  useEffect(() => {
    if (pendingPreview === null) {
      return;
    }
    const timer = setTimeout(() => setPendingPreview(null), 2500);
    return () => clearTimeout(timer);
  }, [pendingPreview]);

  // 封面/播放键 loading 呼吸（仅切换期间可见）
  const shimmerOpacity = useSharedValue(0.55);
  useEffect(() => {
    if (!switching) {
      shimmerOpacity.value = 0.55;
      return;
    }
    shimmerOpacity.value = withRepeat(withTiming(0.95, { duration: 650 }), -1, true);
    return () => {
      shimmerOpacity.value = 0.55;
    };
  }, [switching, shimmerOpacity]);
  const coverSkeletonStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));

  /**
   * 手势线程的 loading 锁：提交切歌时在 worklet 里立即置 true（早于 React 状态回流），
   * 防止 loading 动画还没渲染出来时的第二次拖动又触发一次切歌。
   */
  const switchingSV = useSharedValue(false);
  useEffect(() => {
    switchingSV.value = switching;
  }, [switching, switchingSV]);

  // 曲名区拖动跟手：当前曲名随手指位移，相邻曲名从左右两侧滑入；松手回弹或切歌
  const dragX = useSharedValue(0);
  const textWidth = useSharedValue(0);
  const currentTextStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));
  const nextTextStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: textWidth.value + dragX.value }],
  }));
  const previousTextStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -textWidth.value + dragX.value }],
  }));

  // 显隐：无播放会话不显示；全屏沉浸页（Player/NowPlaying/PhotoViewer/BookReader）不显示
  const visible =
    engineReady && status !== 'idle' && currentTrack !== null && !MINI_PLAYER_HIDDEN_ROUTES.includes(routeName ?? '');
  if (!visible || currentTrack === null) {
    return null;
  }

  const isPlaying = status === 'playing';
  const onTabRoute = TAB_ROUTE_NAMES.includes(routeName ?? '');
  // Tab 页：贴在菜单栏上沿（菜单栏自身含安全区）；无菜单栏：贴屏幕下边框，安全区转为条内 padding
  const hostBottom = onTabRoute ? insets.bottom + TAB_BAR_BASE_HEIGHT : 0;
  const barPaddingBottom = SPACING.s + (onTabRoute ? 0 : insets.bottom);
  const subtitle = currentTrack.artistName ?? currentTrack.albumName;
  const hasNext = adjacent.next !== undefined;
  const hasPrevious = adjacent.previous !== undefined;
  /** 切换期间先显示目标曲名（相邻曲名已取到，不必等原生事件） */
  const displayTitle = switching && pendingPreview !== null ? pendingPreview.title : currentTrack.name;
  const displaySubtitle =
    switching && pendingPreview !== null ? pendingPreview.artist : subtitle;

  const openNowPlaying = () => {
    // 已在 NowPlaying 则忽略（该页本就不显示迷你条，双保险）
    if (navigationRef.current?.getCurrentRoute()?.name === ROUTES.NOW_PLAYING) {
      return;
    }
    navigationRef.current?.navigate(ROUTES.NOW_PLAYING);
  };
  const skipNext = () => {
    setPendingPreview(adjacent.next ?? null);
    void audioService.next();
  };
  const skipPrevious = () => {
    setPendingPreview(adjacent.previous ?? null);
    void audioService.skipToPreviousTrack();
  };

  // 曲名区手势：左右拖动跟手预览相邻曲名，松手时位移过提交阈值才切歌（否则回弹）；
  // Pan 优先于 Tap（Exclusive），单击曲名仍进 NowPlaying；
  // 切歌 loading 期间（switching）禁用拖拽，避免上一次切换尚未生效又叠加新的切歌
  const swipe = Gesture.Pan()
    .enabled(!switching)
    .activeOffsetX([-SWIPE_ACTIVATE_OFFSET, SWIPE_ACTIVATE_OFFSET])
    .failOffsetY([-SWIPE_FAIL_OFFSET, SWIPE_FAIL_OFFSET])
    .onBegin(() => {
      'worklet';
      dragX.value = 0;
    })
    .onUpdate((event) => {
      'worklet';
      if (switchingSV.value) {
        return;
      }
      dragX.value = event.translationX;
    })
    .onEnd((event) => {
      'worklet';
      if (switchingSV.value) {
        dragX.value = withSpring(0, { damping: 20, stiffness: 260 });
        return;
      }
      const commitDistance = Math.max(SWIPE_COMMIT_MIN, textWidth.value * SWIPE_COMMIT_RATIO);
      if (event.translationX <= -commitDistance && hasNext) {
        // 下一首名称已滑入足够长度：归位并切歌（新曲名直接居中，不再回弹旧内容）
        switchingSV.value = true;
        dragX.value = 0;
        runOnJS(skipNext)();
      } else if (event.translationX >= commitDistance && hasPrevious) {
        switchingSV.value = true;
        dragX.value = 0;
        runOnJS(skipPrevious)();
      }
    })
    .onFinalize(() => {
      'worklet';
      // 未达提交阈值 / 手势取消：回弹
      dragX.value = withSpring(0, { damping: 20, stiffness: 260 });
    });
  const tap = Gesture.Tap()
    .enabled(!switching)
    .onEnd((_event, success) => {
      'worklet';
      if (success) {
        runOnJS(openNowPlaying)();
      }
    });

  return (
    <View style={[styles.host, { bottom: hostBottom }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          { paddingBottom: barPaddingBottom },
          // 有菜单栏时：与菜单栏的边界只用一根浅灰发丝线（不用阴影，避免条下出现灰渐变）
          onTabRoute && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator },
        ]}
      >
        {/* 封面：点击进 NowPlaying，但不参与左右拖拽；切换期间显示 loading 骨架 */}
        <Pressable
          onPress={openNowPlaying}
          disabled={switching}
          accessibilityLabel="打开正在播放"
          hitSlop={4}
        >
          {switching ? (
            <Animated.View style={[styles.cover, styles.coverSkeleton, coverSkeletonStyle]} />
          ) : currentTrack.coverImageUrl !== undefined ? (
            <Image
              source={{ uri: currentTrack.coverImageUrl }}
              style={styles.cover}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.cover, styles.coverFallback]}>
              <AppIcon name="audio" size={18} color={t.textSecondary} />
            </View>
          )}
        </Pressable>
        <GestureDetector gesture={Gesture.Exclusive(swipe, tap)}>
          <Animated.View
            style={styles.textViewport}
            onLayout={(event) => {
              textWidth.value = event.nativeEvent.layout.width;
            }}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${displayTitle}${
              displaySubtitle !== undefined ? `，${displaySubtitle}` : ''
            }，打开正在播放；左滑下一首，右滑上一首`}
            onAccessibilityTap={openNowPlaying}
          >
            {/* 上一层：上一首（右滑时从左侧滑入） */}
            {adjacent.previous !== undefined && (
              <Animated.View style={[styles.textLayer, previousTextStyle]} pointerEvents="none">
                <Text style={styles.name} numberOfLines={1}>
                  {adjacent.previous.title}
                </Text>
                {adjacent.previous.artist !== undefined && (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {adjacent.previous.artist}
                  </Text>
                )}
              </Animated.View>
            )}
            {/* 下一层：下一首（左滑时从右侧滑入） */}
            {adjacent.next !== undefined && (
              <Animated.View style={[styles.textLayer, nextTextStyle]} pointerEvents="none">
                <Text style={styles.name} numberOfLines={1}>
                  {adjacent.next.title}
                </Text>
                {adjacent.next.artist !== undefined && (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {adjacent.next.artist}
                  </Text>
                )}
              </Animated.View>
            )}
            {/* 当前曲（最上层，跟手位移；切换期间直接显示目标曲名） */}
            <Animated.View style={[styles.textLayer, currentTextStyle]} pointerEvents="none">
              <Text style={styles.name} numberOfLines={1}>
                {displayTitle}
              </Text>
              {displaySubtitle !== undefined && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {displaySubtitle}
                </Text>
              )}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        <Pressable
          hitSlop={8}
          style={styles.control}
          disabled={switching}
          onPress={() => {
            void audioService.togglePlayPause();
          }}
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
        >
          <View style={[styles.playCircle, { borderColor: t.accent }]}>
            {switching ? (
              <ActivityIndicator size="small" color={t.accent} />
            ) : (
              <AppIcon name={isPlaying ? 'pause' : 'play'} size={16} color={t.accent} />
            )}
          </View>
        </Pressable>
        <Pressable
          hitSlop={8}
          style={styles.control}
          onPress={() => {
            // 关闭播放并关闭迷你条：stop() 报 Stopped、清队列、复位 audio 切片
            setPendingPreview(null);
            void audioService.stop();
          }}
          accessibilityLabel="停止播放并关闭迷你条"
        >
          <AppIcon name="stop" size={20} color={t.accent} />
        </Pressable>
        {queueLength === 1 ? (
          <FavoriteButton
            key={currentTrack.id}
            trackId={currentTrack.id}
            style={queueButtonStyle.control}
          />
        ) : (
          <QueueButton color={t.accent} />
        )}
      </View>
    </View>
  );
}

/**
 * 队列按钮 + 半屏队列弹层：弹层状态收在子组件里，随迷你条一起卸载——
 * 播放会话结束（迷你条返回 null）时弹层显隐自动复位，下次起播不会残留。
 */
function QueueButton({ color }: { color: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        hitSlop={8}
        style={queueButtonStyle.control}
        onPress={() => setVisible(true)}
        accessibilityLabel="播放队列"
      >
        <AppIcon name="playlist" size={22} color={color} />
      </Pressable>
      <QueueSheet visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

/** 队列按钮与条内其他控制键同内距（独立静态样式，供子组件复用） */
const queueButtonStyle = StyleSheet.create({
  control: { paddingHorizontal: SPACING.xs },
});

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    // zIndex：首页横向卡片/行视图可延伸到底部（视觉被 ScrollView 裁剪），无 zIndex 时
    // 底部区域会先命中卡片，导致停止/队列按钮点不到；抬到 100 保证整条都可点
    host: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 100 },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingHorizontal: SPACING.l,
      paddingTop: SPACING.s,
      backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.separator,
    },
    cover: { width: 44, height: 44, borderRadius: 8, backgroundColor: t.bg },
    /** 切换等待期封面骨架（呼吸透明度由 coverSkeletonStyle 驱动；用 separator 保证浅色下可见） */
    coverSkeleton: { backgroundColor: t.separator },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    /** 曲名视口：固定高度 + 裁剪，相邻曲名以绝对层从左右滑入 */
    textViewport: { flex: 1, height: 44, overflow: 'hidden', justifyContent: 'center' },
    textLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    name: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    subtitle: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    control: { paddingHorizontal: SPACING.xs },
    playCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
