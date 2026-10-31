/**
 * 筛选/排序条（M1 文档 §2.1 复用组件 FilterSheet）：
 * 排序（名称 / 首映日期 / 随机）+ 筛选（全部 / 未看 / 已看 / 收藏）+ 混合库类型 chips。
 * 切换即重置重拉（§4.10），由页面回调处理。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SortByEnum } from '@/adapter/model';
import { FILTER_OPTIONS, SORT_OPTIONS } from '@/constant/browse';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface FilterSheetProps {
  /** 当前排序（与 SORT_OPTIONS.value 对应） */
  sortBy: SortByEnum;
  /** 当前筛选：null=全部；服务器 Filters 原值 */
  filter: 'IsUnplayed' | 'IsPlayed' | 'IsFavorite' | null;
  /** 混合库类型选择（仅 MIXED 库显示）：null=全部 */
  kind: 'Movie' | 'Series' | null;
  /** 是否显示类型行（MIXED 库） */
  showKindRow: boolean;
  onSelectSort: (sortBy: SortByEnum) => void;
  onSelectFilter: (filter: 'IsUnplayed' | 'IsPlayed' | 'IsFavorite' | null) => void;
  onSelectKind: (kind: 'Movie' | 'Series' | null) => void;
}

/** 混合库类型 chips（§4.10：全部=Movie,Series、电影=Movie、剧集=Series） */
const KIND_CHIPS: readonly { value: 'Movie' | 'Series' | null; label: string }[] = [
  { value: null, label: '全部' },
  { value: 'Movie', label: '电影' },
  { value: 'Series', label: '剧集' },
];

export function FilterSheet({
  sortBy,
  filter,
  kind,
  showKindRow,
  onSelectSort,
  onSelectFilter,
  onSelectKind,
}: FilterSheetProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>排序</Text>
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={sortBy === option.value}
            onPress={() => onSelectSort(option.value)}
          />
        ))}
      </View>
      {showKindRow && (
        <View style={styles.row}>
          <Text style={styles.label}>类型</Text>
          {KIND_CHIPS.map((chip) => (
            <Chip
              key={chip.label}
              label={chip.label}
              active={kind === chip.value}
              onPress={() => onSelectKind(chip.value)}
            />
          ))}
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>筛选</Text>
        {FILTER_OPTIONS.map((option) => (
          <Chip
            key={option.label}
            label={option.label}
            active={filter === option.value}
            onPress={() => onSelectFilter(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** 单个 chip（选中态 accent 高亮） */
function Chip({ label, active, onPress }: ChipProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  container: { gap: SPACING.s, paddingHorizontal: SPACING.l, paddingVertical: SPACING.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, flexWrap: 'wrap' },
  label: { color: t.textSecondary, fontSize: FONT_SIZE.body, width: 32 },
  chip: {
    borderRadius: 14,
    backgroundColor: t.surface,
    paddingHorizontal: SPACING.m,
    paddingVertical: 4,
  },
  chipActive: { backgroundColor: t.accent },
  chipText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
