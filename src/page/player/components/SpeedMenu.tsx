/**
 * 倍速菜单（控制层底部 1.0X 按钮入口）：档位列表单选，选中即应用并关闭。
 * 沉浸页固定深色口径：COLORS token + 沉浸 accent，不随浅/深主题。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { PLAYBACK_SPEED_LIST } from '@/constant/playback';
import { useImmersiveAccent } from '@/component/useTheme';
import { useT } from '@/i18n';
import { formatPlaybackSpeed } from '@/util/format';

interface SpeedMenuProps {
  current: number;
  onSelect: (speed: number) => void;
  onClose: () => void;
}

export function SpeedMenu({ current, onSelect, onClose }: SpeedMenuProps) {
  const tr = useT();
  const { accent } = useImmersiveAccent();
  return (
    <View style={styles.panel}>
      <Text style={styles.header}>{tr('player.speedMenu')}</Text>
      {PLAYBACK_SPEED_LIST.map((speed) => {
        const selected = speed === current;
        return (
          <Pressable
            key={speed}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => onSelect(speed)}
            accessibilityLabel={formatPlaybackSpeed(speed)}
          >
            <Text style={[styles.rowText, selected && { color: accent }]}>
              {formatPlaybackSpeed(speed)}
            </Text>
            {selected && <Text style={[styles.badge, { color: accent }]}>{tr('player.currentBadge')}</Text>}
          </Pressable>
        );
      })}
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>{tr('player.collapse')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: SPACING.l,
    bottom: 120,
    width: 200,
    backgroundColor: 'rgba(15,20,26,0.95)',
    borderRadius: COLORS.posterRadius,
    padding: SPACING.m,
    gap: SPACING.xs,
  },
  header: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.s,
    borderRadius: 8,
  },
  rowSelected: { backgroundColor: COLORS.surface },
  rowText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  badge: { fontSize: FONT_SIZE.caption },
  closeButton: {
    alignItems: 'center',
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  closeText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});