/**
 * 多选操作栏（音乐个人歌单二改，2026-11-15）：
 * 歌曲列表多选态下的底部浮动条——已选数量 + 全选 +「加入歌单」+ 取消。
 * bottomInset 由页面传入（迷你条活跃时让位），样式对齐 QueueSheet 面板口径。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/component/useTheme';
import { CARD_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';

interface MultiSelectBarProps {
  /** 已选数量 */
  selectedCount: number;
  /** 全选回调（页面传当前列表全部 id） */
  onSelectAll: () => void;
  /** 「加入歌单」回调（未选中任何行时禁用） */
  onAdd: () => void;
  /** 取消多选 */
  onCancel: () => void;
  /** 距屏幕底部间距（迷你条活跃时叠加其高度） */
  bottomInset: number;
}

export function MultiSelectBar({
  selectedCount,
  onSelectAll,
  onAdd,
  onCancel,
  bottomInset,
}: MultiSelectBarProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const addDisabled = selectedCount === 0;

  return (
    <View style={[styles.bar, { bottom: bottomInset }]} pointerEvents="box-none">
      <View style={styles.panel}>
        <Text style={styles.count}>{tr('playlist.selectedCount', { count: selectedCount })}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={onSelectAll} accessibilityLabel={tr('playlist.selectAll')}>
            <Text style={styles.actionText}>{tr('playlist.selectAll')}</Text>
          </Pressable>
          <Pressable
            style={[styles.addButton, addDisabled && styles.addButtonDisabled]}
            onPress={onAdd}
            disabled={addDisabled}
            accessibilityLabel={tr('playlist.addToPlaylist')}
          >
            <Text style={styles.addText}>{tr('playlist.addToPlaylist')}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={onCancel} accessibilityLabel={tr('common.cancel')}>
            <Text style={styles.actionText}>{tr('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    bar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    panel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      backgroundColor: t.surfaceElevated,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.s,
      marginHorizontal: SPACING.m,
      // 浮层阴影对齐浮动菜单口径
      elevation: 4,
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    count: { fontSize: FONT_SIZE.body, color: t.textPrimary, flexShrink: 1 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
    action: { paddingHorizontal: SPACING.s, paddingVertical: SPACING.xs },
    actionText: { fontSize: FONT_SIZE.body, color: t.textSecondary },
    addButton: {
      backgroundColor: t.accent,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.xs,
    },
    addButtonDisabled: { opacity: 0.4 },
    addText: { fontSize: FONT_SIZE.body, color: t.accentOn, fontWeight: '600' },
  });
