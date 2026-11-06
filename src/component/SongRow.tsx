/**
 * 曲目行（M5 文档 §4.1；音乐列表参考稿口径）：
 * 左侧两位序号 + 曲名/艺人两行，艺人行尾为时长徽标（替代 VIP/杜比标签位）；
 * 无封面缩略图；行尾为收藏与加入队列按钮；行间发丝分割线。
 * 当前曲标题/序号高亮；trailing 供调用方追加行尾操作。
 */
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AudioItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import { AppError, errorMessageOf } from '@/infra/error';
import { audioService } from '@/service/AudioService';
import { markService } from '@/service/MarkService';
import { useFavoriteStore } from '@/store/favoriteStore';
import { formatClock } from '@/util/format';

/** 操作失败 Toast（文案取 ERROR_MESSAGE_MAP 唯一出处） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

interface SongRowProps {
  song: AudioItem;
  /** 是否当前播放曲（高亮） */
  active?: boolean;
  /** 行左侧序号（列表位置/专辑曲号；无则隐藏） */
  indexNumber?: number;
  /** 是否显示行底发丝分割线（列表最后一行传 false） */
  showDivider?: boolean;
  /** 点击行为（列表点歌 / 队列跳曲） */
  onPress: () => void;
  /** 长按行为（队列页拖动启动） */
  onLongPress?: () => void;
  /** 行尾扩展（删除按钮等） */
  trailing?: React.ReactNode;
}

export function SongRow({
  song,
  active = false,
  indexNumber,
  showDivider = false,
  onPress,
  onLongPress,
  trailing,
}: SongRowProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  // 行内切换过的收藏态优先（列表数据不会即时回写）；未切换过取接口返回值
  const favoriteOverride = useFavoriteStore((state) => state.overrideById[song.id]);
  const setFavoriteOverride = useFavoriteStore((state) => state.setOverride);
  const favorite = favoriteOverride ?? song.favorite ?? false;
  const favoritePendingRef = useRef(false);

  const toggleFavorite = () => {
    if (favoritePendingRef.current) {
      return;
    }
    favoritePendingRef.current = true;
    const next = !favorite;
    setFavoriteOverride(song.id, next);
    void markService
      .setFavorite(song.id, next)
      .catch((err: unknown) => {
        setFavoriteOverride(song.id, !next);
        toastError(err);
      })
      .finally(() => {
        favoritePendingRef.current = false;
      });
  };

  /** 加入队列成功由 AudioService 统一弹居中提示；此处仅处理异常 */
  const addToQueue = () => {
    void audioService.addToQueue([song]).catch(toastError);
  };

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        {indexNumber !== undefined && (
          <Text style={[styles.indexNumber, active && styles.activeText]}>
            {String(indexNumber).padStart(2, '0')}
          </Text>
        )}
        <View style={styles.center}>
          <Text style={[styles.name, active && styles.activeText]} numberOfLines={1}>
            {song.name}
          </Text>
          <View style={styles.metaRow}>
            {song.artistName !== undefined && (
              <Text style={styles.artist} numberOfLines={1}>
                {song.artistName}
              </Text>
            )}
            {song.runtimeMs !== undefined && (
              <View style={styles.durationBadge}>
                <Text style={styles.duration}>{formatClock(song.runtimeMs)}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            hitSlop={8}
            onPress={toggleFavorite}
            accessibilityLabel={
              favorite ? tr('action.unfavorite') : tr('action.favorite')
            }
          >
            <AppIcon
              name={favorite ? 'heart' : 'heartOutline'}
              size={22}
              color={favorite ? t.danger : t.textTertiary}
            />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={addToQueue}
            accessibilityLabel={tr('songRow.addToQueue', { name: song.name })}
          >
            <AppIcon name="playlistPlus" size={22} color={t.textTertiary} />
          </Pressable>
        </View>
        {trailing}
      </Pressable>
      {showDivider && <View style={styles.divider} />}
    </View>
  );
}

/** 样式工厂（token 注入；M6 主题 sweep 统一模式） */
const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingVertical: SPACING.m,
      paddingHorizontal: SPACING.m,
    },
    pressed: { opacity: 0.7 },
    indexNumber: {
      color: t.textTertiary,
      fontSize: FONT_SIZE.title,
      fontWeight: '500',
      width: 32,
      textAlign: 'center',
    },
    center: { flex: 1, gap: SPACING.xs },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
    activeText: { color: t.accent },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
    artist: { color: t.textSecondary, fontSize: 12, flexShrink: 1 },
    /** 时长徽标：占据参考稿 VIP/杜比标签位（浅底小圆角） */
    durationBadge: {
      backgroundColor: t.surface,
      borderRadius: 3,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 1,
    },
    duration: { color: t.textSecondary, fontSize: 11 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.m },
    /** 分割线从序号列之后开始（序号宽 32 + 行内左右间距） */
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.separator,
      marginLeft: 32 + SPACING.m * 2,
      marginRight: SPACING.m,
    },
  });
