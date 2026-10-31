/**
 * 码率菜单（M3 文档 §4.8.1）：四档单选；蜂窝强制期间顶部提示。点选 = setMaxBitrateMode
 * （落盘，T4 依赖）+ switchBitrate（转码重启 / 直连提示下次生效）——本菜单是唯一写档位
 * 设置的入口，与蜂窝自动降档（不落盘）严格区分（03 §4.8.1/§4.9）。
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BITRATE_TIER_LIST, type BitrateTierKey } from '@/constant/bitrate';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';

interface BitrateMenuProps {
  /** 当前生效档位（session.maxBitrateBps 反查；直连回退用户设置档位） */
  activeTier: BitrateTierKey;
  /** 蜂窝自动降档生效中（顶部提示「蜂窝网络 · 已自动降至 4Mbps」） */
  cellularForced: boolean;
  onSelect: (tier: BitrateTierKey) => void;
  onClose: () => void;
}

export function BitrateMenu({ activeTier, cellularForced, onSelect, onClose }: BitrateMenuProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>码率</Text>
      {cellularForced ? (
        <Text style={styles.cellularNotice}>蜂窝网络 · 已自动降至 4Mbps</Text>
      ) : null}
      <ScrollView style={styles.list} nestedScrollEnabled>
        {BITRATE_TIER_LIST.map((tier) => {
          const active = tier.key === activeTier;
          return (
            <Pressable
              key={tier.key}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => onSelect(tier.key)}
            >
              <Text style={styles.rowText}>{tier.label}</Text>
              {active ? <Text style={styles.badge}>当前</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>收起</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: SPACING.l,
    bottom: 72,
    width: 300,
    backgroundColor: 'rgba(15,20,26,0.95)',
    borderRadius: COLORS.posterRadius,
    padding: SPACING.m,
    gap: SPACING.s,
  },
  panelTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '700' },
  cellularNotice: { color: COLORS.warning, fontSize: FONT_SIZE.body - 2 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.s,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.s,
    borderRadius: 8,
  },
  rowActive: { backgroundColor: 'rgba(76,141,255,0.25)' },
  rowText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  badge: { color: COLORS.accent, fontSize: FONT_SIZE.body - 3 },
  closeButton: {
    alignItems: 'center',
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  closeText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});
