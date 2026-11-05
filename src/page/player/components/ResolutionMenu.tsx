/**
 * 转码分辨率菜单（原码率菜单替换）：五档单选；蜂窝强制期间顶部提示。
 * 点选 = setMaxResolutionTier（落盘）+ switchResolution（转码重启 / 直连提示下次生效）
 * ——本菜单是唯一写档位设置的入口，与蜂窝自动降档（不落盘）严格区分（03 §4.8.1/§4.9）。
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ResolutionTierKey } from '@/constant/resolution';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import {
  availableResolutionTiers,
  normalizeResolutionTierForSource,
} from '@/util/resolution';

interface ResolutionMenuProps {
  /** 当前生效档位（session.maxResolutionTier；直连会话不展示本菜单） */
  activeTier: ResolutionTierKey;
  /** 源视频高度：隐藏高于源的档位（转码只降不升） */
  sourceHeight?: number;
  /** 蜂窝自动降档生效中（顶部提示「蜂窝网络 · 已自动降至 480p」） */
  cellularForced: boolean;
  onSelect: (tier: ResolutionTierKey) => void;
  onClose: () => void;
}

export function ResolutionMenu({
  activeTier,
  sourceHeight,
  cellularForced,
  onSelect,
  onClose,
}: ResolutionMenuProps) {
  // 原画恒显示；高于源分辨率的档无意义，隐藏；当前档高于源时效果等价原画，展示为原画
  const tierList = availableResolutionTiers(sourceHeight);
  const shownActiveTier = normalizeResolutionTierForSource(activeTier, sourceHeight);
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>转码分辨率</Text>
      {cellularForced ? (
        <Text style={styles.cellularNotice}>蜂窝网络 · 已自动降至 480p</Text>
      ) : null}
      <ScrollView style={styles.list} nestedScrollEnabled>
        {tierList.map((tier) => {
          const active = tier.key === shownActiveTier;
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
