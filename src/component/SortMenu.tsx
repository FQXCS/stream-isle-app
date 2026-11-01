/**
 * 库页排序菜单（参考稿：库名居中、右上角排序）：
 * 导航栏右上角按钮（三条递减横线图标）+ 页内下拉面板，默认列出视频类 SORT_OPTIONS 十三项，
 * 调用方可传 optionList 按当前页面/条目类型收窄（书库/文件夹/照片/音频各自的可用字段）。
 * 选中项显示「✓」并跟随升降序箭头
 * （↓ 降序 / ↑ 升序；随机排序无方向，不显示箭头）。项数多于可视高度时面板内滚动。
 * 面板为页内浮层（非 Modal）：覆盖筛选条与海报墙，点击空白处或系统返回键关闭。
 */
import { useEffect } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { SortByEnum } from '@/adapter/model';
import { SORT_OPTIONS, type SortOption } from '@/constant/browse';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface SortMenuButtonProps {
  /** 打开/关闭排序面板（导航栏 headerRight） */
  onPress: () => void;
}

/** 导航栏右上角排序按钮：三条左对齐、长度递减的横线（参考稿图标） */
export function SortMenuButton({ onPress }: SortMenuButtonProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={SPACING.s}
      accessibilityRole="button"
      accessibilityLabel="排序"
    >
      <View style={styles.bars}>
        <View style={[styles.bar, styles.barLong]} />
        <View style={[styles.bar, styles.barMid]} />
        <View style={[styles.bar, styles.barShort]} />
      </View>
    </Pressable>
  );
}

interface SortMenuProps {
  /** 当前排序字段 */
  sortBy: SortByEnum;
  /** 当前排序方向（选中项箭头） */
  sortOrder: 'ASC' | 'DESC';
  onSelect: (sortBy: SortByEnum) => void;
  onClose: () => void;
  /** 可用排序项（按页面/条目类型过滤；缺省为视频类十三项） */
  optionList?: readonly SortOption[];
}

/** 排序下拉面板（绝对定位铺满页面内容区，面板贴右上角；超出一屏时面板内滚动） */
export function SortMenu({
  sortBy,
  sortOrder,
  onSelect,
  onClose,
  optionList = SORT_OPTIONS,
}: SortMenuProps) {
  const t = useTheme();
  const styles = createStyles(t);
  // 面板最大高度 = 屏高 55%（13 项超出时内部滚动，不撑满整屏）
  const { height: windowHeight } = useWindowDimensions();

  // 面板打开期间拦截系统返回键（先关面板，不退出库页）
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      {/* 面板吃掉点击，避免冒泡到遮罩被误关；项数超出可视高度时面板内滚动 */}
      <Pressable
        style={[styles.panel, { maxHeight: Math.round(windowHeight * 0.55) }]}
        onPress={() => undefined}
      >
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelContent}
          bounces={false}
        >
          {optionList.map((option) => {
            const active = option.value === sortBy;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect(option.value)}
              >
                <Text style={[styles.check, active && styles.activeText]}>
                  {active ? '✓' : ''}
                </Text>
                <Text style={[styles.label, active && styles.activeText]}>{option.label}</Text>
                {active && option.defaultOrder !== null && (
                  <Text style={[styles.arrow, styles.activeText]}>
                    {sortOrder === 'DESC' ? '↓' : '↑'}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    button: { paddingHorizontal: SPACING.xs, paddingVertical: SPACING.xs },
    pressed: { opacity: 0.6 },
    bars: { gap: 3 },
    bar: { height: 3, borderRadius: 1.5, backgroundColor: t.textPrimary },
    barLong: { width: 20 },
    barMid: { width: 14 },
    barShort: { width: 8 },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'flex-end',
      paddingTop: SPACING.s,
      paddingRight: SPACING.m,
      zIndex: 10,
    },
    panel: {
      minWidth: 148,
      borderRadius: POSTER_RADIUS,
      backgroundColor: t.surfaceElevated,
      overflow: 'hidden',
      elevation: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    panelScroll: { flexGrow: 0, flexShrink: 1 },
    panelContent: { paddingVertical: SPACING.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      paddingHorizontal: SPACING.m,
      gap: SPACING.s,
    },
    rowPressed: { backgroundColor: t.surface },
    check: { width: 18, color: t.accent, fontSize: FONT_SIZE.body },
    label: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    arrow: { color: t.accent, fontSize: FONT_SIZE.body },
    activeText: { color: t.accent },
  });
