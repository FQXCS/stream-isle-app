/**
 * 全局迷你播放条（M5 文档 §4.10；设计文档 §7.5/§10.1「全局常驻」）。
 * 挂载位置：根布局（NavigationContainer 同级的绝对定位浮层）——保证四个 Tab 与已推入
 * Root Stack 的库/详情页都可见。显隐 = audio.status !== 'idle' 且当前路由 ∉
 * MINI_PLAYER_HIDDEN_ROUTES。内容：封面 + 曲名/艺人（单行截断）+ 播放/暂停 + 下一曲；
 * 点击整条 → NowPlaying（已在页内则忽略）。底部让位常量供列表页 padding 补偿。
 */
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { MINI_PLAYER_HIDDEN_ROUTES, ROUTES } from '@/constant/navigation';
import { audioService } from '@/service/AudioService';
import { usePlayerStore } from '@/store/playerStore';
import { navigationRef } from '@/page/navigation/navigationRef';

/** 迷你条总高（含上边距阴影留白），列表页底部 padding 补偿（05 文档 §4.10） */
export const MINI_PLAYER_TOTAL_HEIGHT = 64;

/** 底部 Tab 栏基准高度（bottom-tabs 标准 Android 高度；总偏移 = 该值 + 安全区底部） */
const TAB_BAR_BASE_HEIGHT = 56;

/**
 * 列表页底部让位（05 文档 §4.10「MINI_PLAYER_TOTAL_HEIGHT 常量，列表页底部 padding 补偿，
 * 避免末行被遮」）：音频活跃时返回迷你条高度、否则 0；列表页叠加进 contentContainerStyle
 * 的 paddingBottom。与 MiniPlayer 显隐同源（audio.status !== 'idle'）。
 */
export function useMiniPlayerPadding(): number {
  const engineReady = usePlayerStore((state) => state.audio.engineReady);
  const status = usePlayerStore((state) => state.audio.status);
  return engineReady && status !== 'idle' ? MINI_PLAYER_TOTAL_HEIGHT : 0;
}

export function MiniPlayer() {
  const t = useTheme();
  const styles = createStyles(t);
  const engineReady = usePlayerStore((state) => state.audio.engineReady);
  const status = usePlayerStore((state) => state.audio.status);
  const currentTrack = usePlayerStore((state) => state.audio.currentTrack);
  // 当前路由名（根布局浮层在 NavigationContainer 之外，经 navigationRef 订阅路由状态）
  const [routeName, setRouteName] = useState<string | undefined>(undefined);
  // Tab 栏上方定位（05 §4.10「底部 Tab 栏上方常驻」）：总偏移 = tab 栏高 + 安全区底部
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const refresh = () => {
      setRouteName(navigationRef.current?.getCurrentRoute()?.name);
    };
    refresh();
    const unsubscribe = navigationRef.addListener('state', refresh);
    return unsubscribe;
  }, []);

  // 显隐：无播放会话不显示；全屏沉浸页（Player/NowPlaying/PhotoViewer）不显示
  const visible =
    engineReady && status !== 'idle' && currentTrack !== null && !MINI_PLAYER_HIDDEN_ROUTES.includes(routeName ?? '');
  if (!visible || currentTrack === null) {
    return null;
  }

  const isPlaying = status === 'playing';

  return (
    <View style={[styles.host, { bottom: insets.bottom + TAB_BAR_BASE_HEIGHT }]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
        onPress={() => {
          // 已在 NowPlaying 则忽略（重复 navigate 不入栈）
          if (navigationRef.current?.getCurrentRoute()?.name !== ROUTES.NOW_PLAYING) {
            navigationRef.current?.navigate(ROUTES.NOW_PLAYING);
          }
        }}
      >
        {currentTrack.coverImageUrl !== undefined ? (
          <Image
            source={{ uri: currentTrack.coverImageUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <AppIcon name="audio" size={16} color={t.textSecondary} />
          </View>
        )}
        <View style={styles.center}>
          <Text style={styles.name} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          {currentTrack.artistName !== undefined && (
            <Text style={styles.artist} numberOfLines={1}>
              {currentTrack.artistName}
            </Text>
          )}
        </View>
        <Pressable
          hitSlop={8}
          style={styles.control}
          onPress={() => {
            void audioService.togglePlayPause();
          }}
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
        >
          <AppIcon name={isPlaying ? 'pause' : 'play'} size={20} color={t.textPrimary} />
        </Pressable>
        <Pressable
          hitSlop={8}
          style={styles.control}
          onPress={() => {
            void audioService.next();
          }}
          accessibilityLabel="下一首"
        >
          <AppIcon name="skipNext" size={20} color={t.textPrimary} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    marginHorizontal: SPACING.s,
    marginBottom: SPACING.s,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: 12,
    backgroundColor: t.surface,
    elevation: 8,
  },
  pressed: { opacity: 0.85 },
  cover: { width: 44, height: 44, borderRadius: 6, backgroundColor: t.bg },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, gap: 2 },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  artist: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  control: { paddingHorizontal: SPACING.s },
});
