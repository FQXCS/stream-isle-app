/**
 * Now Playing 全屏页（05 文档 §4.10；设计文档 §10.2）：
 * 有封面 = 封面模糊铺满的沉浸深色玻璃（白字）；无封面 = 回退当前主题的默认玻璃（配色随主题）；
 * 大封面 + 曲名/艺人 + 常驻歌词区（水平拖动 = 视频播放页同款 seek 预览 HUD，松手才 seekTo）
 * + 复用 M2 SeekBar（拖动 = seekTo + 即时 Progress）+ 控制行（模式/上一曲/播放暂停/下一曲/队列）
 * + 播放模式切换提示（2s 自动消失）+ 队列面板（默认收起）。
 * 页面数据全部来自 playerStore.audio + useProgress（每秒订阅，不进 store），无独立请求。
 * 封面态沿用媒体沉浸页固定深色（06 §4.6.1），无封面态跟随主题 token。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useProgress } from '@rntp/player';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { setStatusBarStyle } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { useResolvedScheme, useTheme } from '@/component/useTheme';
import { MODE_HINT_DURATION_MS } from '@/constant/audio';
import { COLORS, SPACING } from '@/constant/theme';
import { audioService } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { formatClock } from '@/util/format';
import { SeekBar } from '@/page/player/components/SeekBar';
import type { RootStackParamList } from '@/page/navigation/types';
import { GlassBackdrop } from '@/page/nowplaying/components/GlassBackdrop';
import { LyricsPanel } from '@/page/nowplaying/components/LyricsPanel';
import { ModeButton } from '@/page/nowplaying/components/ModeButton';
import { QueuePanel } from '@/page/nowplaying/components/QueuePanel';
import { SeekDragArea } from '@/page/nowplaying/components/SeekDragArea';

type NowPlayingNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 封面左右留白（参考稿封面约占屏宽 76%，比页面 24 内距再收 16） */
const COVER_HORIZONTAL_MARGIN = SPACING.xl + SPACING.l;
/** 封面占屏高比例上限（矮屏按高度收缩，保证歌词区与控制行可见） */
const COVER_HEIGHT_RATIO = 0.42;
/** 封面大圆角（参考稿口径，大于海报 12） */
const COVER_RADIUS = 24;
/** 播放按钮直径（白色圆形主操作，参考稿口径） */
const PLAY_BUTTON_SIZE = 64;

export function NowPlayingScreen() {
  const navigation = useNavigation<NowPlayingNavigationProp>();
  const route = useRoute<{ key: string; name: string; params?: { openQueue?: boolean } }>();
  const insets = useSafeAreaInsets();
  const scheme = useResolvedScheme();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const currentTrack = usePlayerStore((state) => state.audio.currentTrack);
  const status = usePlayerStore((state) => state.audio.status);
  // 迷你条「队列」按钮直达：路由参数决定进页即展开队列面板
  const [queueVisible, setQueueVisible] = useState(route.params?.openQueue === true);
  /** 播放模式切换提示文案（null = 不显示；2s 后自动清空） */
  const [modeHint, setModeHint] = useState<string | null>(null);
  const modeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 迷你条与 Now Playing 各自订阅进度（@rntp/player v5 的间隔单位为「秒」，1 = 每秒），
  // 避免 store 每秒写入（05 文档 §4.7）
  const progress = useProgress(1);

  /** 有封面走沉浸深色；无封面回退当前主题玻璃（文字/控件随之切换） */
  const hasCover = currentTrack?.coverImageUrl !== undefined;

  // 封面态深色玻璃 → 浅色状态栏图标；无封面主题玻璃 → 浅色主题用深色图标；
  // 离开时按当前方案还原（06 §4.6.1）
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(hasCover || scheme === 'dark' ? 'light' : 'dark');
      return () => {
        setStatusBarStyle(scheme === 'light' ? 'dark' : 'light');
      };
    }, [scheme, hasCover])
  );

  // 提示计时器随页面卸载清理
  useEffect(
    () => () => {
      if (modeHintTimerRef.current !== null) {
        clearTimeout(modeHintTimerRef.current);
      }
    },
    []
  );

  const showModeHint = useCallback((label: string) => {
    setModeHint(label);
    if (modeHintTimerRef.current !== null) {
      clearTimeout(modeHintTimerRef.current);
    }
    modeHintTimerRef.current = setTimeout(() => {
      modeHintTimerRef.current = null;
      setModeHint(null);
    }, MODE_HINT_DURATION_MS);
  }, []);

  const handleSeek = useCallback((positionMs: number) => {
    void audioService.seekTo(positionMs);
  }, []);

  if (currentTrack === null) {
    // 无播放会话进入（理论不可达：入口仅迷你条点击）——给空态兜底
    return (
      <View style={[styles.emptyFill, { backgroundColor: t.bg }]}>
        <EmptyView title="当前没有播放中的歌曲" />
      </View>
    );
  }

  const isPlaying = status === 'playing';
  const positionMs = progress.position * 1000;
  const durationMs = progress.duration * 1000;
  const coverSize = Math.round(
    Math.min(width - COVER_HORIZONTAL_MARGIN * 2, height * COVER_HEIGHT_RATIO)
  );

  // 页面 tone：封面态固定深色（白字），无封面态取当前主题 token
  const textPrimary = hasCover ? COLORS.textPrimary : t.textPrimary;
  const textSecondary = hasCover ? COLORS.textSecondary : t.textSecondary;
  const accent = hasCover ? COLORS.accent : t.accent;
  const playButtonColor = hasCover ? '#FFFFFF' : t.textPrimary;
  const playIconColor = hasCover ? COLORS.bg : t.bg;
  // 浅色玻璃页白轨不可见：轨道配色跟随主题（播放页仍用默认白）
  const seekPalette = hasCover
    ? undefined
    : { played: t.textPrimary, buffered: t.textTertiary, base: t.separator, thumb: t.textPrimary };

  return (
    <View style={[styles.fill, { backgroundColor: hasCover ? COLORS.bg : t.bg }]}>
      <GlassBackdrop coverImageUrl={currentTrack.coverImageUrl} />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + SPACING.s, paddingBottom: insets.bottom + SPACING.m },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            hitSlop={8}
            onPress={() => navigation.goBack()}
            accessibilityLabel="收起播放页"
          >
            <AppIcon name="chevronDown" size={26} color={textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>正在播放</Text>
          {/* 与左侧图标等宽的占位，保证标题居中 */}
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.coverWrap}>
          {currentTrack.coverImageUrl !== undefined ? (
            <Image
              source={{ uri: currentTrack.coverImageUrl }}
              style={[
                styles.cover,
                { width: coverSize, height: coverSize, borderRadius: COVER_RADIUS },
              ]}
              contentFit="cover"
              transition={250}
            />
          ) : (
            <View
              style={[
                styles.cover,
                styles.coverFallback,
                {
                  width: coverSize,
                  height: coverSize,
                  borderRadius: COVER_RADIUS,
                  backgroundColor: t.surface,
                  borderColor: t.separator,
                },
              ]}
            >
              <AppIcon name="audio" size={56} color={t.textTertiary} />
            </View>
          )}
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: textPrimary }]} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          {currentTrack.artistName !== undefined && (
            <Text style={[styles.artist, { color: textSecondary }]} numberOfLines={1}>
              {currentTrack.artistName}
            </Text>
          )}
        </View>

        {/* 常驻歌词区：水平拖动沿用视频播放页 seek 手势（拖动中 HUD 预览，松手才 seek） */}
        <View style={styles.lyricsArea}>
          <SeekDragArea positionMs={positionMs} durationMs={durationMs} onSeek={handleSeek}>
            <LyricsPanel
              itemId={currentTrack.id}
              textColor={hasCover ? COLORS.textSecondary : t.textSecondary}
              activeTextColor={hasCover ? COLORS.textPrimary : t.textPrimary}
            />
          </SeekDragArea>
          {/* 播放模式切换提示：参考稿同款胶囊，2s 后自动消失 */}
          {modeHint !== null && (
            <View style={styles.modeHintLayer} pointerEvents="none">
              <View style={styles.modeHint}>
                <Text style={styles.modeHintText}>{modeHint}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.seekBlock}>
          <View style={styles.seekBarRow}>
            <SeekBar
              positionMs={positionMs}
              bufferedMs={progress.buffered * 1000}
              durationMs={durationMs}
              onPreview={() => undefined}
              onSeek={handleSeek}
              palette={seekPalette}
            />
          </View>
          <View style={styles.timeRow}>
            <Text style={[styles.time, { color: textSecondary }]}>{formatClock(positionMs)}</Text>
            <Text style={[styles.time, { color: textSecondary }]}>{formatClock(durationMs)}</Text>
          </View>
        </View>

        <View style={styles.controlRow}>
          <ModeButton iconColor={textPrimary} onModeChange={showModeHint} />
          <Pressable
            hitSlop={8}
            onPress={() => {
              void audioService.previous();
            }}
            accessibilityLabel="上一首"
          >
            <AppIcon name="skipPrevious" size={30} color={textPrimary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={[styles.playButton, { backgroundColor: playButtonColor }]}
            onPress={() => {
              void audioService.togglePlayPause();
            }}
            accessibilityLabel={isPlaying ? '暂停' : '播放'}
          >
            <AppIcon name={isPlaying ? 'pause' : 'play'} size={30} color={playIconColor} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              void audioService.next();
            }}
            accessibilityLabel="下一首"
          >
            <AppIcon name="skipNext" size={30} color={textPrimary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setQueueVisible((value) => !value);
            }}
            accessibilityLabel="播放队列"
          >
            <AppIcon name="playlist" size={26} color={queueVisible ? accent : textPrimary} />
          </Pressable>
        </View>
      </View>
      {queueVisible && (
        <>
          {/* 队列外的整屏可点区域：无视觉遮罩，点任意队列外区域收起队列 */}
          <Pressable
            style={styles.queueBackdrop}
            onPress={() => {
              setQueueVisible(false);
            }}
            accessibilityLabel="收起队列"
          />
          <View
            style={[
              styles.queuePanel,
              { paddingBottom: insets.bottom, backgroundColor: t.surface },
            ]}
          >
            <QueuePanel
              onCleared={() => {
                // 清空队列即停止播放并复位 audio 切片：收起面板并退出 NowPlaying
                setQueueVisible(false);
                navigation.goBack();
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  emptyFill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  headerTitle: { fontSize: 15, fontWeight: '600' },
  headerSpacer: { width: 26 },
  coverWrap: { alignItems: 'center', marginTop: SPACING.s },
  cover: {
    elevation: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  /** 无封面：同尺寸玻璃占位（底色/描边/图标随主题） */
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleBlock: { alignSelf: 'stretch', marginTop: SPACING.l },
  title: { fontSize: 24, fontWeight: '700' },
  artist: { fontSize: 14, marginTop: 6 },
  /** 歌词区占满剩余高度（矮屏可压缩，最小保留两行歌词） */
  lyricsArea: { flex: 1, minHeight: 72, marginTop: SPACING.m },
  seekBlock: { marginTop: SPACING.s },
  seekBarRow: { flexDirection: 'row', alignItems: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  time: { fontSize: 12 },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.l,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  /** 模式切换提示层：贴歌词区底部居中（不遮挡控制行） */
  modeHintLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: SPACING.s,
    alignItems: 'center',
  },
  modeHint: {
    backgroundColor: 'rgba(20, 24, 30, 0.78)',
    borderRadius: 20,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.s,
  },
  modeHintText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  /** 队列面板外可点区域（无遮罩）：点任意面板外位置收起队列 */
  queueBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  queuePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '45%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
});
