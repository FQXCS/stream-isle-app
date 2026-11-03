/**
 * 锚定菜单（M8 增量）：详情页「更多」与库页卡片长按共用。
 * 菜单出现在锚点下方（下方空间不足时翻到上方），水平方向夹紧在屏幕安全边距内；
 * 点击遮罩关闭，选中项先关闭菜单再执行动作。行样式对齐参考稿：左文案、右图标、细分隔线。
 */
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppIcon, type AppIconName } from '@/component/AppIcon';

/** 锚点矩形（measureInWindow 屏幕坐标） */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 菜单项 */
export interface AnchorMenuItem {
  key: string;
  label: string;
  /** 右侧图标（可选：纯文字菜单项不传） */
  icon?: AppIconName;
  /** danger 用于删除等破坏性动作（红色文案/图标） */
  tone?: 'danger';
  disabled?: boolean;
  onPress: () => void;
}

interface AnchorMenuProps {
  /** null 时不渲染（关闭态） */
  anchor: AnchorRect | null;
  itemList: readonly AnchorMenuItem[];
  onClose: () => void;
}

/** 菜单宽度（参考稿约 200–240dp） */
const MENU_WIDTH = 216;
/** 与锚点的间距 */
const MENU_GAP = 6;
/** 单项高度 */
const ITEM_HEIGHT = 48;
/** 菜单面板上下内边距 */
const PANEL_PADDING = 4;

export function AnchorMenu({ anchor, itemList, onClose }: AnchorMenuProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  if (anchor === null || itemList.length === 0) {
    return null;
  }

  const menuHeight = itemList.length * ITEM_HEIGHT + PANEL_PADDING * 2;
  const spaceBelow = windowHeight - (anchor.y + anchor.height);
  // 下方放不下且上方放得下 → 翻到锚点上方
  const openAbove = spaceBelow < menuHeight + MENU_GAP && anchor.y > menuHeight + MENU_GAP;
  const top = openAbove
    ? anchor.y - MENU_GAP - menuHeight
    : anchor.y + anchor.height + MENU_GAP;
  const left = Math.min(
    Math.max(SPACING.m, anchor.x + anchor.width / 2 - MENU_WIDTH / 2),
    windowWidth - MENU_WIDTH - SPACING.m
  );

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.panel, { top, left, width: MENU_WIDTH }]}>
          {itemList.map((item, index) => {
            const color = item.tone === 'danger' ? t.danger : t.textPrimary;
            return (
              <Pressable
                key={item.key}
                disabled={item.disabled}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={({ pressed }) => [
                  styles.item,
                  index > 0 && styles.itemDivider,
                  pressed && !item.disabled && styles.pressed,
                  item.disabled && styles.disabled,
                ]}
              >
                {/* 单行省略：服务器名等超长文案不换行，避免撑破菜单行高 */}
                <Text style={[styles.itemLabel, { color }]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.icon !== undefined && <AppIcon name={item.icon} size={20} color={color} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    // 半透明灰遮罩：菜单弹出时压暗背景，点击遮罩关闭
    root: { flex: 1, backgroundColor: t.scrim },
    panel: {
      position: 'absolute',
      paddingVertical: PANEL_PADDING,
      borderRadius: POSTER_RADIUS,
      backgroundColor: t.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    item: {
      height: ITEM_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.l,
      gap: SPACING.m,
    },
    itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
    itemLabel: { flexShrink: 1, fontSize: FONT_SIZE.title - 1 },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.4 },
  });
