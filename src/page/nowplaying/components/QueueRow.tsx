/**
 * 队列行（05 文档 §4.11 改版）：参考稿两行式——曲名 + 「艺人 - 专辑」副标题，
 * 无封面缩略图与曲目号；当前曲在行尾显示均衡器图标，右侧常驻移除按钮。
 * 长按交给 DraggableFlatList 的 drag 启动拖动排序。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import { SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import type { AudioQueueEntry } from '@/service/AudioService';
import { PlayingIndicator } from '@/page/nowplaying/components/PlayingIndicator';

interface QueueRowProps {
  entry: AudioQueueEntry;
  /** 是否当前播放曲（行尾均衡器高亮） */
  active: boolean;
  /** 行间分隔线（末行不画） */
  showSeparator: boolean;
  onPress: () => void;
  /** 长按启动拖动排序 */
  onLongPress?: () => void;
  onRemove: () => void;
}

export function QueueRow({
  entry,
  active,
  showSeparator,
  onPress,
  onLongPress,
  onRemove,
}: QueueRowProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const subtitle = [entry.artist, entry.album].filter((part) => part !== undefined).join(' - ');

  return (
    <Pressable
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={[styles.row, showSeparator && styles.separator]}>
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {entry.title}
          </Text>
          {subtitle !== '' && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {active && <PlayingIndicator />}
        <Pressable
          hitSlop={12}
          style={styles.removeButton}
          onPress={onRemove}
          accessibilityLabel={tr('queue.removeA11y', { title: entry.title })}
        >
          <AppIcon name="close" size={20} color={t.textTertiary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    press: { paddingHorizontal: SPACING.xl },
    pressed: { opacity: 0.6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingVertical: SPACING.s,
    },
    separator: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.separator,
    },
    center: { flex: 1 },
    title: { color: t.textPrimary, fontSize: 16, fontWeight: '500' },
    subtitle: { color: t.textSecondary, fontSize: 12, marginTop: SPACING.xs },
    removeButton: { padding: SPACING.xs },
  });
