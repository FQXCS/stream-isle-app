/**
 * 库页排序菜单（参考稿：库名居中、右上角排序）：
 * 导航栏右上角按钮（排序图标）+ 页内下拉面板，默认列出视频类 SORT_OPTIONS 十三项，
 * 调用方可传 optionList 按当前页面/条目类型收窄（书库/文件夹/照片/音频各自的可用字段）。
 * 选中项显示对勾并跟随升降序箭头
 * （降序 / 升序；随机排序无方向，不显示箭头）。项数多于可视高度时面板内滚动。
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
import {
  CARD_RADIUS,
  FLOATING_SHADOW,
  FONT_SIZE,
  SPACING,
  type ThemeTokens,
} from '@/constant/theme';
import { AppIcon } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';

interface SortMenuButtonProps {
  /** 打开/关闭排序面板（导航栏 headerRight） */
  onPress: () => void;
}

/** 导航栏右上角排序按钮（图标库 sort-variant） */
export function SortMenuButton({ onPress }: SortMenuButtonProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={SPACING.s}
      accessibilityRole="button"
      accessibilityLabel={tr('sortMenu.title')}
    >
      <AppIcon name="sort" size={22} color={t.textPrimary} />
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
  const tr = useT();
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
                <View style={styles.checkSlot}>
                  {active && <AppIcon name="check" size={14} color={t.accent} />}
                </View>
                <Text style={[styles.label, active && styles.activeText]}>
                  {tr(option.labelKey)}
                </Text>
                {active && option.defaultOrder !== null && (
                  <AppIcon
                    name={sortOrder === 'DESC' ? 'arrowDown' : 'arrowUp'}
                    size={14}
                    color={t.accent}
                  />
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
      borderRadius: CARD_RADIUS,
      backgroundColor: t.surfaceElevated,
      overflow: 'hidden',
      ...FLOATING_SHADOW,
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
    checkSlot: { width: 18, alignItems: 'flex-start' },
    label: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    activeText: { color: t.accent },
  });
