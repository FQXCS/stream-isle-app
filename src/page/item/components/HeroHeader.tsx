/**
 * 详情页 Hero 区（M2 文档 §4.11 + M6 §4.6.2 转场目标 + M8 参考稿重排）：
 * 背景大图 + 顶部返回/更多浮层 + 居中标题（Logo 优先）与元数据行。
 * M6 转场目标（06 文档 §4.6.2）：挂载时测量目标矩形回填 transitionStore.markTarget；
 * 飞行期间（transitionStore.active 命中本页）Hero 真图延后淡入，避免飞行图与真图叠影，
 * end() 后立即显示。测量失败/无转场上下文 → 立即显示（退化为普通转场）。
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MediaDetail } from '@/adapter/model';
import type { AnchorRect } from '@/component/AnchorMenu';
import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, SPACING } from '@/constant/theme';
import { useTransitionStore } from '@/store/transitionStore';

interface HeroHeaderProps {
  detail: MediaDetail;
  /** 元数据行文案（页面按可播放/剧集口径拼好） */
  metaText: string;
  onBack: () => void;
  /** 「更多」按钮矩形回调（菜单锚定用） */
  onMore: (anchor: AnchorRect) => void;
}

export function HeroHeader({ detail, metaText, onBack, onMore }: HeroHeaderProps) {
  // M6 转场：本页为飞行目标时真图延后淡入（active.uri 与海报同源时才生效，异源直接显示）
  const active = useTransitionStore((state) => state.active);
  const markTarget = useTransitionStore((state) => state.markTarget);
  const isTransitionTarget = active !== null;
  const [showHero, setShowHero] = useState(!isTransitionTarget);
  const containerRef = useRef<ComponentRef<typeof View> | null>(null);
  const moreRef = useRef<ComponentRef<typeof View> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // 飞行 250ms 后淡入真图（飞行图覆盖期间不叠影；与 SharedPosterOverlay 时长同源口径）；
    // 无转场上下文立即显示（setTimeout 异步置位，避免 effect 内同步 setState）
    const timer = setTimeout(() => setShowHero(true), isTransitionTarget ? 250 : 0);
    return () => clearTimeout(timer);
  }, [isTransitionTarget]);

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={() => {
        // M6 转场目标测量（06 §4.6.2）：measureInWindow 取屏幕绝对矩形 → markTarget
        containerRef.current?.measureInWindow((x, y, width, height) => {
          markTarget({ x, y, width, height: Math.min(height, 300) });
        });
      }}
    >
      {detail.heroImageUrl !== undefined && showHero ? (
        <Image
          source={{ uri: detail.heroImageUrl }}
          style={styles.hero}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.hero, styles.heroFallback]} />
      )}
      {/* 渐变压黑（设计文档 §10.1 大图沉浸）：底部保持深色以承载白色标题/元数据 */}
      <View
        style={[
          styles.overlay,
          {
            backgroundImage:
              'linear-gradient(to bottom, rgba(11,15,20,0.15) 0%, rgba(11,15,20,0.45) 52%, rgba(11,15,20,0.94) 100%)',
          },
        ]}
      />
      {/* 顶部浮层：返回 / 更多（参考稿） */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.xs }]}>
        <Pressable style={styles.topButton} hitSlop={8} onPress={onBack} accessibilityLabel="返回">
          <AppIcon name="back" size={24} color="#FFFFFF" />
        </Pressable>
        <Pressable
          ref={moreRef}
          style={styles.topButton}
          hitSlop={8}
          accessibilityLabel="更多"
          onPress={() => {
            moreRef.current?.measureInWindow((x, y, width, height) => {
              onMore({ x, y, width, height });
            });
          }}
        >
          <AppIcon name="more" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
      {/* 居中标题与元数据（参考稿：标题 / 技术信息居中） */}
      <View style={styles.content}>
        {detail.logoImageUrl !== undefined ? (
          <Image source={{ uri: detail.logoImageUrl }} style={styles.logo} contentFit="contain" />
        ) : (
          <Text style={styles.title} numberOfLines={2}>
            {detail.name}
          </Text>
        )}
        <Text style={styles.meta} numberOfLines={2}>
          {metaText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 360 },
  hero: { width: '100%', height: '100%' },
  heroFallback: { backgroundColor: '#151A21' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: SPACING.s,
    right: SPACING.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'absolute',
    left: SPACING.l,
    right: SPACING.l,
    bottom: SPACING.l,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  logo: { width: 200, height: 64, marginBottom: SPACING.xs },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FONT_SIZE.body - 1,
    textAlign: 'center',
  },
});
