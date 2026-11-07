/**
 * 播放页「更多」菜单（参考图重构）：右上四点入口弹出，收纳字幕/音轨/转码分辨率三入口
 * （原底部三按钮迁入）；转码分辨率仅服务器转码会话可见（本地/直连无此概念）。
 * 沉浸页固定深色口径：COLORS token，不随浅/深主题。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';

/** 更多菜单可打开的子菜单（与页面 VisibleMenu 子集一致） */
export type PlayerSubMenu = 'subtitle' | 'audio' | 'resolution';

interface PlayerMoreMenuProps {
  /** 转码分辨率入口可见性（仅服务器转码会话） */
  showResolution: boolean;
  onSelect: (menu: PlayerSubMenu) => void;
  onClose: () => void;
}

export function PlayerMoreMenu({ showResolution, onSelect, onClose }: PlayerMoreMenuProps) {
  const tr = useT();
  const rowList: { key: PlayerSubMenu; label: string; icon: AppIconName }[] = [
    { key: 'subtitle', label: tr('player.subtitleMenu'), icon: 'subtitle' },
    { key: 'audio', label: tr('player.audioMenu'), icon: 'audio' },
  ];
  if (showResolution) {
    rowList.push({ key: 'resolution', label: tr('player.resolutionMenu'), icon: 'resolution' });
  }
  return (
    <View style={styles.panel}>
      {rowList.map((row) => (
        <Pressable key={row.key} style={styles.row} onPress={() => onSelect(row.key)}>
          <AppIcon name={row.icon} size={18} color={COLORS.textPrimary} />
          <Text style={styles.rowText}>{row.label}</Text>
        </Pressable>
      ))}
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
    top: 64,
    width: 220,
    backgroundColor: 'rgba(15,20,26,0.95)',
    borderRadius: COLORS.posterRadius,
    padding: SPACING.m,
    gap: SPACING.s,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.s,
    borderRadius: 8,
  },
  rowText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  closeButton: {
    alignItems: 'center',
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  closeText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});