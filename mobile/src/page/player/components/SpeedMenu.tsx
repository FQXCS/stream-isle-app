/**
 * 倍速菜单（控制层底部 1.0X 按钮入口）：档位列表单选，选中即应用并关闭；
 * 点击面板外区域关闭（原「收起」按钮已移除）。横屏高度不足时列表内滚动。
 * 沉浸页固定深色口径：COLORS token + 沉浸 accent，不随浅/深主题。
 */
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { PLAYBACK_SPEED_LIST } from '@/constant/playback';
import { useImmersiveAccent } from '@/component/useTheme';
import { useT } from '@/i18n';
import { formatPlaybackSpeed } from '@/util/format';

/** 面板距播放器底部工具行的偏移（px） */
const PANEL_BOTTOM_OFFSET = 120;
/** 面板顶部预留的安全余量（状态栏 + 呼吸空间，px） */
const PANEL_TOP_MARGIN = 40;

interface SpeedMenuProps {
  current: number;
  onSelect: (speed: number) => void;
  onClose: () => void;
}

export function SpeedMenu({ current, onSelect, onClose }: SpeedMenuProps) {
  const tr = useT();
  const { accent } = useImmersiveAccent();
  const { height: windowHeight } = useWindowDimensions();
  // 限高：横屏高度不足时顶部不出屏，档位列表改为内部滚动
  const maxHeight = Math.max(200, windowHeight - PANEL_BOTTOM_OFFSET - PANEL_TOP_MARGIN);
  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* 全屏透明遮罩：点击面板外关闭 */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('player.collapse')} />
      <View style={[styles.panel, { maxHeight }]}>
        <Text style={styles.header}>{tr('player.speedMenu')}</Text>
        <ScrollView contentContainerStyle={styles.list}>
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
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  panel: {
    position: 'absolute',
    right: SPACING.l,
    bottom: PANEL_BOTTOM_OFFSET,
    width: 200,
    backgroundColor: 'rgba(15,20,26,0.95)',
    borderRadius: COLORS.posterRadius,
    padding: SPACING.m,
  },
  header: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600', marginBottom: SPACING.xs },
  list: { gap: SPACING.xs },
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
});
