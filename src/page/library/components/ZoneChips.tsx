/**
 * 音乐库四区切换 chips（M5 文档 §4.12）：专辑/艺术家/歌单/全部歌曲，切换即换列表。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** 四区枚举（MusicLibraryScreen 内部分发键） */
export type MusicZone = 'album' | 'artist' | 'playlist' | 'song';

const ZONE_OPTIONS: readonly { key: MusicZone; label: string }[] = [
  { key: 'album', label: '专辑' },
  { key: 'artist', label: '艺术家' },
  { key: 'playlist', label: '歌单' },
  { key: 'song', label: '全部歌曲' },
];

interface ZoneChipsProps {
  active: MusicZone;
  onSelect: (zone: MusicZone) => void;
}

export function ZoneChips({ active, onSelect }: ZoneChipsProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.row}>
      {ZONE_OPTIONS.map((option) => {
        const isActive = option.key === active;
        return (
          <Pressable
            key={option.key}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelect(option.key)}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  chip: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    borderRadius: 14,
    backgroundColor: t.surface,
  },
  chipActive: { backgroundColor: t.accent },
  label: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  labelActive: { color: '#FFFFFF' },
});
