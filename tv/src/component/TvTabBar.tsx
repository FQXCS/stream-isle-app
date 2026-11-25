/**
 * TV 焦点 Tab 栏（TV-m2 §4.1）：库页 Tab 分类焦点化。
 * ≤5 个 Tab（MAX_LIBRARY_TABS 截断保证）横向平铺一屏，普通 View 不经 ScrollView——
 * 左右键几何搜索自然移动、无 arrowScroll 恒消费问题；焦点态 accentSoft 背景（row 态），
 * 选中态 accent 下划线区分「焦点」与「选中」两个维度；CENTER 确认切换。
 * 渲染层必须挂在网格 FlatList 的 ListHeaderComponent 内（同 ScrollView 子树，
 * 网格顶行 UP 可达本栏——TV-m1-S3 arrowScroll 子树限制的网格版结论）。
 */
import { StyleSheet, Text, View } from 'react-native';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

export interface TvTabOption {
  id: string;
  /** 已翻译文案（调用方经 tr(labelKey) 传入，label 随语言变化重渲染） */
  label: string;
}

interface TvTabBarProps {
  tabs: TvTabOption[];
  selectedId: string;
  /** CENTER 确认回调（切 Tab） */
  onSelect(id: string): void;
}

export function TvTabBar({ tabs, selectedId, onSelect }: TvTabBarProps) {
  const t = useTvTheme();
  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const selected = tab.id === selectedId;
        return (
          <TvPressable
            key={tab.id}
            focusKind="row"
            focusable
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab.id)}
            style={styles.tab}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? t.accent : t.textPrimary },
              ]}
            >
              {tab.label}
            </Text>
            {/* 选中态下划线（焦点态由 TvPressable row 背景表达，两个维度并存） */}
            <View
              style={[styles.underline, selected && { backgroundColor: t.accent }]}
            />
          </TvPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  tab: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
  },
  label: { fontSize: 18, fontWeight: '600' },
  underline: { height: 3, width: '100%', borderRadius: 2, marginTop: 4 },
});
