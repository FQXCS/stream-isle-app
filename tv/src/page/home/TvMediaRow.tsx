/**
 * TV 横向媒体行（TV-m1 §4.4）：标题 + 横向 RN FlatList（fork 列表焦点支持；
 * horizontal + 焦点边缘滚动，TV 设计 §6.2）+ TvPosterCard。
 * 自绘不复用手机 PosterRow/ResumeRow（@/component 禁入）。
 * 边缘逃逸（TV-m1 实测定案）：Android 横向 ScrollView 的 arrowScroll 恒消费 DPAD
 * （AOSP 实现 return true，事件不冒泡到窗口级焦点搜索），且 ViewManager 'focus' 命令
 * 被 enableImperativeFocus=false（C++ flags 仅允许一次 override，已占）置为 no-op——
 * 行首放 ListHeader 跳板：行首卡 nextFocusLeft 指向跳板 tag（arrowScroll 内
 * findUserSetNextFocus 走「横向 ScrollView 子树内 findViewById」寻址），聚焦跳板时
 * 显示「侧栏入口」镜像（icon + accentSoft 底，宽 72 不与卡 x 重叠），RIGHT 回本行首卡
 * （nextFocusDown 兜底）、CENTER 为确认位。跳板 x 常态不与卡重叠 → DOWN/UP beam 天然排除。
 */
import { useState } from 'react';
import type { ComponentRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvFocusStyle } from '@tv/component/TvFocusStyle';
import { TvPosterCard, type TvCardVariant } from '@tv/page/home/TvPosterCard';
import { useTvTheme } from '@tv/component/useTvTheme';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvMediaRowProps {
  title: string;
  itemList: MediaLibraryItem[];
  /** wide=继续观看 16:9 断点卡；poster=按类型图幅 */
  variant?: TvCardVariant;
  /** 首屏第一行第一卡持焦点（TV-m1 验收 #6） */
  autoFocusFirst?: boolean;
  /** 跳板 UP 的显式目标（侧栏镜像代理 tag；纵向 ScrollView 子树内可达） */
  escapeFocusUpTag?: number;
  /** Enter 落地（TV-m2 收口 m1 no-op 切片：首页/搜索结果由调用方下发路由） */
  onPressItem?: (item: MediaLibraryItem) => void;
}

export function TvMediaRow({
  title,
  itemList,
  variant = 'poster',
  autoFocusFirst = false,
  escapeFocusUpTag,
  onPressItem,
}: TvMediaRowProps) {
  // 跳板 React tag：行首卡 nextFocusLeft 指向它（tag 相同跳过 setState 防循环）
  const [sentinelTag, setSentinelTag] = useState<number | null>(null);
  if (itemList.length === 0) {
    return null;
  }
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>
      <FlatList
        horizontal
        data={itemList}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
        // 元素形式（组件类型稳定，不触发 FlatList 卸载重挂；箭头函数组件会导致 ref 重放循环）
        ListHeaderComponent={
          <TvRowEscapeSentinel
            label={title}
            focusUpTag={escapeFocusUpTag}
            onRef={(ref) => {
              const tag = findNodeHandleTagOf(ref);
              setSentinelTag((prev) => (prev === tag ? prev : tag));
            }}
          />
        }
        renderItem={({ item, index }) => (
          <TvPosterCard
            item={item}
            variant={variant}
            hasTVPreferredFocus={autoFocusFirst && index === 0}
            // 仅行首卡 LEFT 覆盖到跳板（其余卡行内移动走几何搜索）
            nextFocusLeft={index === 0 && sentinelTag !== null ? sentinelTag : undefined}
            onPress={onPressItem !== undefined ? () => onPressItem(item) : undefined}
          />
        )}
      />
    </View>
  );
}

/**
 * 行首边缘跳板：渲染于 FlatList contentContainer 首位（横向 ScrollView 子树内——
 * arrowScroll 子树焦点寻址的唯一可达点）。常态隐形（宽 14dp，不与卡 x 重叠 →
 * DOWN/UP beam 天然排除）；聚焦时显示「侧栏入口」镜像（back 图标 + accentSoft 底，
 * 宽 72dp 仍小于卡 left，RIGHT 可回本行首卡），CENTER 为确认位。
 */
export function TvRowEscapeSentinel({
  label,
  focusUpTag,
  onRef,
}: {
  label: string;
  /** UP 显式目标（侧栏镜像代理 tag） */
  focusUpTag?: number;
  onRef(ref: ComponentRef<typeof View> | null): void;
}) {
  const t = useTvTheme();
  const { focused, onFocus: focusIn, onBlur: focusOut } = useTvFocusStyle('row');
  return (
    <TvPressable
      focusKind="row"
      focusable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[styles.escapeSentinel, focused && styles.escapeSentinelFocused]}
      onFocus={focusIn}
      onBlur={focusOut}
      ref={onRef}
      nextFocusUp={focusUpTag}
    >
      {focused && <AppIcon name="back" size={26} color={t.textPrimary} />}
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 14 },
  rowTitle: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16 },
  rowContent: { paddingHorizontal: 16, gap: 16 },
  escapeSentinel: { width: 14, opacity: 0.01, alignItems: 'center', justifyContent: 'center' },
  escapeSentinelFocused: { width: 72, opacity: 1 },
});
