/**
 * 曲目行（M5 文档 §4.1：专辑/热门/全部歌曲/队列共用；M6 主题 token 化）。
 * 曲目号/封面缩略/曲名/艺人/时长 + 当前曲高亮；队列页复用时由调用方传 trailing（删除按钮等）。
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AudioItem } from '@/adapter/model';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { formatClock } from '@/util/format';

interface SongRowProps {
  song: AudioItem;
  /** 是否当前播放曲（高亮） */
  active?: boolean;
  /** 行左侧序号（专辑曲号/队列序号；无则隐藏） */
  indexNumber?: number;
  /** 点击行为（列表点歌 / 队列跳曲） */
  onPress: () => void;
  /** 长按行为（队列页拖动启动） */
  onLongPress?: () => void;
  /** 行尾扩展（队列页删除按钮等） */
  trailing?: React.ReactNode;
}

export function SongRow({
  song,
  active = false,
  indexNumber,
  onPress,
  onLongPress,
  trailing,
}: SongRowProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {indexNumber !== undefined && (
        <Text style={[styles.indexNumber, active && styles.activeText]}>{indexNumber}</Text>
      )}
      {song.coverImageUrl !== undefined ? (
        <Image
          source={{ uri: song.coverImageUrl }}
          style={styles.cover}
          contentFit="cover"
          transition={150}
          recyclingKey={song.id}
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Text style={styles.fallbackText}>♪</Text>
        </View>
      )}
      <View style={styles.center}>
        <Text style={[styles.name, active && styles.activeText]} numberOfLines={1}>
          {song.name}
        </Text>
        {song.artistName !== undefined && (
          <Text style={styles.artist} numberOfLines={1}>
            {song.artistName}
          </Text>
        )}
      </View>
      {song.runtimeMs !== undefined && (
        <Text style={styles.duration}>{formatClock(song.runtimeMs)}</Text>
      )}
      {trailing}
    </Pressable>
  );
}

/** 样式工厂（token 注入；M6 主题 sweep 统一模式） */
const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingVertical: SPACING.s,
      paddingHorizontal: SPACING.m,
    },
    pressed: { opacity: 0.7 },
    indexNumber: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body,
      width: 24,
      textAlign: 'center',
    },
    cover: { width: 44, height: 44, borderRadius: 6, backgroundColor: t.surface },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    fallbackText: { color: t.textSecondary, fontSize: FONT_SIZE.title },
    center: { flex: 1, gap: 2 },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    activeText: { color: t.accent },
    artist: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    duration: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  });
