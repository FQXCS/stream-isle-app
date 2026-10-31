/**
 * 详情页 Hero 区（M2 文档 §4.11 + M6 §4.6.2 转场目标）：heroImageUrl 大背景 +
 * 渐变压黑（RN 0.88 原生 backgroundImage 渐变，不引第三方）、叠加 Logo/标题 +
 * tagline 首行 + 元数据行。
 * M6 转场目标（06 文档 §4.6.2）：挂载时测量目标矩形回填 transitionStore.markTarget；
 * 飞行期间（transitionStore.active 命中本页）Hero 真图延后淡入，避免飞行图与真图叠影，
 * end() 后立即显示。测量失败/无转场上下文 → 立即显示（退化为普通转场）。
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaDetail } from '@/adapter/model';
import { FONT_SIZE, SPACING } from '@/constant/theme';
import { formatClock } from '@/util/format';
import { useTransitionStore } from '@/store/transitionStore';

interface HeroHeaderProps {
  detail: MediaDetail;
}

/** 元数据行（02 §4.11：年份 · 分级 · 评分 · 时长 · 类型） */
function metaLineOf(detail: MediaDetail): string {
  const parts: string[] = [];
  if (detail.productionYear !== undefined) {
    parts.push(String(detail.productionYear));
  }
  if (detail.officialRating !== undefined) {
    parts.push(detail.officialRating);
  }
  if (detail.communityRating !== undefined) {
    parts.push(`★ ${detail.communityRating.toFixed(1)}`);
  }
  if (detail.runtimeMs !== undefined) {
    parts.push(formatClock(detail.runtimeMs));
  }
  if (detail.genreList.length > 0) {
    parts.push(detail.genreList.slice(0, 3).join(' '));
  }
  return parts.join(' · ');
}

export function HeroHeader({ detail }: HeroHeaderProps) {
  const tagline = detail.taglineList?.[0];
  // M6 转场：本页为飞行目标时真图延后淡入（active.uri 与海报同源时才生效，异源直接显示）
  const active = useTransitionStore((state) => state.active);
  const markTarget = useTransitionStore((state) => state.markTarget);
  const isTransitionTarget = active !== null;
  const [showHero, setShowHero] = useState(!isTransitionTarget);
  const containerRef = useRef<ComponentRef<typeof View> | null>(null);

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
      {/* 渐变压黑（设计文档 §10.1 大图沉浸）：RN 0.88 原生 backgroundImage 线性渐变 */}
      <View
        style={[
          styles.overlay,
          {
            backgroundImage:
              'linear-gradient(to bottom, rgba(11,15,20,0.15) 0%, rgba(11,15,20,0.55) 60%, rgba(11,15,20,1) 100%)',
          },
        ]}
      />
      <View style={styles.content}>
        {detail.logoImageUrl !== undefined ? (
          <Image source={{ uri: detail.logoImageUrl }} style={styles.logo} contentFit="contain" />
        ) : (
          <Text style={styles.title}>{detail.name}</Text>
        )}
        {tagline !== undefined && <Text style={styles.tagline}>{tagline}</Text>}
        <Text style={styles.meta}>{metaLineOf(detail)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 300 },
  hero: { width: '100%', height: '100%' },
  heroFallback: { backgroundColor: '#151A21' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  content: {
    position: 'absolute',
    left: SPACING.l,
    right: SPACING.l,
    bottom: SPACING.m,
    gap: SPACING.xs,
  },
  logo: { width: 180, height: 60, marginBottom: SPACING.xs },
  title: {
    color: '#EAECEF',
    fontSize: FONT_SIZE.header,
    fontWeight: '700',
  },
  tagline: {
    color: '#9AA3AD',
    fontSize: FONT_SIZE.body,
    fontStyle: 'italic',
  },
  meta: { color: '#9AA3AD', fontSize: FONT_SIZE.body },
});
