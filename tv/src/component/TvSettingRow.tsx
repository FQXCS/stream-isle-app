/**
 * TV 设置行（TV-m4 §4.1，自绘）：图标 + 标签 + 右侧值文案/选中勾标。
 * 手机 SettingRow/SelectableRow 在 @/component 白名单外且无焦点态，不 import。
 * 可操作行经 TvPressable row 态焦点化；纯展示行（无 onPress，如约版本号行）
 * 渲染普通 View 不可聚焦。LEFT 经 nextFocusLeft 显式逃逸到侧栏镜像代理
 * （代理须挂同 ScrollView 子树内，TV-m1-S3 子树寻址结论）。
 */
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import type { AppIconName } from '@/component/AppIcon';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

interface TvSettingRowProps {
  icon: AppIconName;
  label: string;
  /** 右侧次级信息（flavor·版本 / 版本号等） */
  value?: string;
  /** 选中勾标（当前活跃服务器/账号） */
  selected?: boolean;
  /** 缩进（服务器卡下的账号行） */
  indented?: boolean;
  /** 缺省渲染纯展示行（不可聚焦） */
  onPress?(): void;
  /** LEFT 显式逃逸目标（侧栏镜像代理 tag） */
  nextFocusLeftTag?: number;
  /** 首屏焦点（fork hasTVPreferredFocus） */
  hasTVPreferredFocus?: boolean;
}

/** 行图标档（次级信息 14–16 / 按钮 18–20 口径，设置行取 20） */
const ROW_ICON_SIZE = 20;

export function TvSettingRow({
  icon,
  label,
  value,
  selected = false,
  indented = false,
  onPress,
  nextFocusLeftTag,
  hasTVPreferredFocus = false,
}: TvSettingRowProps) {
  const t = useTvTheme();
  const content = (
    <>
      <AppIcon name={icon} size={ROW_ICON_SIZE} color={selected ? t.accent : t.textSecondary} />
      <Text style={[styles.label, { color: t.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.trailing}>
        {value !== undefined && (
          <Text style={[styles.value, { color: t.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        )}
        {selected && <AppIcon name="check" size={ROW_ICON_SIZE} color={t.accent} />}
      </View>
    </>
  );
  const rowStyle = [styles.row, indented && styles.indented];
  if (onPress === undefined) {
    return <View style={rowStyle}>{content}</View>;
  }
  return (
    <TvPressable
      focusKind="row"
      focusable
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={value !== undefined ? `${label}，${value}` : label}
      accessibilityState={{ selected }}
      style={rowStyle}
      nextFocusLeft={nextFocusLeftTag}
      onPress={onPress}
    >
      {content}
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  indented: { marginLeft: 34 },
  label: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  trailing: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { fontSize: 16 },
});
