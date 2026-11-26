/**
 * TV 倍速菜单（TV-m3 §4.3，照抄手机 SpeedMenu 契约的 TV 改造）：档位列表单选，
 * 选中即应用并由页面关闭（onSelect 回调）；BACK 关闭由页面 BackHandler 统一收口，
 * 故无手机 onClose scrim 点按通道。面板 trapFocus 四向，焦点经 hasTVPreferredFocus
 * 落当前档位行；沉浸页固定深色口径（COLORS token + 沉浸 accent）。
 */
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { PLAYBACK_SPEED_LIST } from '@/constant/playback';
import { useImmersiveAccent } from '@/component/useTheme';
import { useT } from '@/i18n';
import { formatPlaybackSpeed } from '@/util/format';

import { TvPressable } from '@tv/component/TvPressable';

/** 面板距播放器底部工具行的偏移（px，手机同口径） */
const PANEL_BOTTOM_OFFSET = 120;
/** 面板顶部预留的安全余量（px） */
const PANEL_TOP_MARGIN = 40;

interface TvSpeedMenuProps {
  current: number;
  onSelect: (speed: number) => void;
}

export function TvSpeedMenu({ current, onSelect }: TvSpeedMenuProps) {
  const tr = useT();
  const { accent } = useImmersiveAccent();
  const { height: windowHeight } = useWindowDimensions();
  // 限高：横屏高度不足时顶部不出屏，档位列表改为内部滚动
  const maxHeight = Math.max(200, windowHeight - PANEL_BOTTOM_OFFSET - PANEL_TOP_MARGIN);
  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={[styles.panel, { maxHeight }]}
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
      >
        <Text style={styles.header}>{tr('player.speedMenu')}</Text>
        <ScrollView contentContainerStyle={styles.list}>
          {PLAYBACK_SPEED_LIST.map((speed) => {
            const selected = speed === current;
            return (
              <TvPressable
                key={speed}
                focusKind="row"
                focusable
                hasTVPreferredFocus={selected}
                style={styles.row}
                onPress={() => onSelect(speed)}
                accessibilityLabel={formatPlaybackSpeed(speed)}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.rowText, selected && { color: accent }]}>
                  {formatPlaybackSpeed(speed)}
                </Text>
                {selected && (
                  <Text style={[styles.badge, { color: accent }]}>{tr('player.currentBadge')}</Text>
                )}
              </TvPressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  panel: {
    position: 'absolute',
    right: SPACING.l,
    bottom: PANEL_BOTTOM_OFFSET,
    width: 220,
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
  rowText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  badge: { fontSize: FONT_SIZE.caption },
});