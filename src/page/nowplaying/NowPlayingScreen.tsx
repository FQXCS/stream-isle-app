/**
 * Now Playing 全屏页（M5 文档 §4.10 + M6 文档 §4.6.3 歌词面板；设计文档 §10.2）：
 * 大封面（expo-image 渐显）/ 歌词面板双态切换 + 曲名/艺人 + 复用 M2 SeekBar（拖动 =
 * seekTo + 即时 Progress）+ 控制行（模式按钮/上一曲/播放暂停/下一曲/队列）+ 队列面板（默认收起）。
 * 页面数据全部来自 playerStore.audio + useProgress（每秒订阅，不进 store），无独立请求。
 * 本页属媒体沉浸页固定深色白名单（06 §4.6.1），维持 COLORS 固定深色。
 */
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { useProgress } from '@rntp/player';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SeekBar } from '@/page/player/components/SeekBar';
import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { COLORS, SPACING } from '@/constant/theme';
import { audioService } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { ModeButton } from '@/page/nowplaying/components/ModeButton';
import { QueuePanel } from '@/page/nowplaying/components/QueuePanel';
import { LyricsPanel } from '@/page/nowplaying/components/LyricsPanel';

export function NowPlayingScreen() {
  const currentTrack = usePlayerStore((state) => state.audio.currentTrack);
  const status = usePlayerStore((state) => state.audio.status);
  const [queueVisible, setQueueVisible] = useState(false);
  // M6：封面/歌词双态（06 §4.6.3「封面/歌词双态切换」）
  const [showLyrics, setShowLyrics] = useState(false);
  // 迷你条与 Now Playing 各自订阅进度（每秒），避免 store 每秒写入（05 文档 §4.7）
  const progress = useProgress(1000);

  const handleSeek = useCallback((positionMs: number) => {
    void audioService.seekTo(positionMs);
  }, []);

  if (currentTrack === null) {
    // 无播放会话进入（理论不可达：入口仅迷你条点击）——给空态兜底
    return (
      <View style={styles.fill}>
        <EmptyView title="当前没有播放中的歌曲" />
      </View>
    );
  }

  const isPlaying = status === 'playing';

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        {showLyrics && currentTrack !== null ? (
          // M6 歌词态（封面/歌词双态，06 §4.6.3）：等高面板替换大封面
          <View style={[styles.lyricsBox, { marginTop: SPACING.xl }]}>
            <LyricsPanel itemId={currentTrack.id} />
          </View>
        ) : (
          <>
            {currentTrack.coverImageUrl !== undefined ? (
              <Image
                source={{ uri: currentTrack.coverImageUrl }}
                style={styles.cover}
                contentFit="cover"
                transition={250}
              />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <AppIcon name="audio" size={64} color={COLORS.textSecondary} />
              </View>
            )}
          </>
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          {currentTrack.artistName !== undefined && (
            <Text style={styles.artist} numberOfLines={1}>
              {currentTrack.artistName}
            </Text>
          )}
        </View>
        <SeekBar
          positionMs={progress.position * 1000}
          bufferedMs={progress.buffered * 1000}
          durationMs={progress.duration * 1000}
          onPreview={() => undefined}
          onSeek={handleSeek}
        />
        <View style={styles.controlRow}>
          <ModeButton />
          <Pressable
            hitSlop={8}
            onPress={() => {
              void audioService.previous();
            }}
            accessibilityLabel="上一首"
          >
            <AppIcon name="skipPrevious" size={26} color={COLORS.textPrimary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={styles.playButton}
            onPress={() => {
              void audioService.togglePlayPause();
            }}
            accessibilityLabel={isPlaying ? '暂停' : '播放'}
          >
            <AppIcon name={isPlaying ? 'pause' : 'play'} size={28} color="#FFFFFF" />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              void audioService.next();
            }}
            accessibilityLabel="下一首"
          >
            <AppIcon name="skipNext" size={26} color={COLORS.textPrimary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setQueueVisible((value) => !value);
            }}
            accessibilityLabel="播放队列"
          >
            <AppIcon name="playlist" size={26} color={COLORS.textPrimary} />
          </Pressable>
          {/* M6：封面/歌词双态切换（06 §4.6.3） */}
          <Pressable
            hitSlop={8}
            onPress={() => {
              setShowLyrics((value) => !value);
            }}
            accessibilityLabel={showLyrics ? '显示封面' : '显示歌词'}
          >
            <AppIcon
              name="lyrics"
              size={26}
              color={showLyrics ? COLORS.accent : COLORS.textPrimary}
            />
          </Pressable>
        </View>
      </ScrollView>
      {queueVisible && (
        <View style={styles.queuePanel}>
          <QueuePanel />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.l },
  cover: {
    width: 280,
    height: 280,
    borderRadius: COLORS.posterRadius,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.xl,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  /** M6 歌词态容器（与大封面同占位） */
  lyricsBox: { height: 340, alignSelf: 'stretch' },
  titleBlock: { alignItems: 'center', gap: SPACING.xs },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '600' },
  artist: { color: COLORS.textSecondary, fontSize: 14 },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xl,
    marginTop: SPACING.s,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  queuePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '55%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.bg,
    elevation: 12,
  },
});
