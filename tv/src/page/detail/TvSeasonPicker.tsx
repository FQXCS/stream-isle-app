/**
 * TV 季选择器（TV-m2 §4.3，TV-m2-S1 契约：手机 SeasonPicker 是 ItemDetailScreen 内私有
 * 组件禁入，TV 自绘）：焦点下拉列表——按钮 CENTER 开合，面板内 UP/DOWN 移动、CENTER 选中
 * 回填 selectedSeasonIdRef 重拉集；BACK 关闭面板（BackHandler 拦截，不冒泡成路由 pop）。
 * 打开时焦点经 hasTVPreferredFocus 落当前选中季行（trapFocus 语义：BACK 先关面板再退栈）。
 */
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import type { SeasonItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { useT } from '@/i18n';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvSeasonPickerProps {
  seasons: SeasonItem[];
  selectedSeason: SeasonItem | null;
  /** 选中回调（页面回填 ref + 重拉集 + 关闭由本组件负责） */
  onSelect(season: SeasonItem): void;
  /** 按钮实例 tag 上抛（显式焦点引导目标——nextFocus 目标必须可聚焦，TV-m2 走查定案） */
  onButtonTag?(tag: number | null): void;
}

/** 季展示文案（季号 0/缺失为特别篇惯例，手机 seasonLabelOf 同口径） */
function seasonLabelOf(season: SeasonItem, label: string, specialLabel: string): string {
  return season.indexNumber > 0
    ? label.replace('{number}', String(season.indexNumber))
    : specialLabel;
}

export function TvSeasonPicker({ seasons, selectedSeason, onSelect, onButtonTag }: TvSeasonPickerProps) {
  const t = useTvTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);

  // BACK 关面板（trapFocus 第一层）；关闭态不订阅（BACK 走 native-stack pop 路由）
  useEffect(() => {
    if (!open) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const numberLabel = tr('item.seasonNumber');
  const specialLabel = tr('item.specialSeason');
  const buttonLabel =
    selectedSeason !== null
      ? seasonLabelOf(selectedSeason, numberLabel, specialLabel)
      : tr('item.selectSeason');

  return (
    <View>
      <TvPressable
        focusKind="row"
        focusable
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.button}
        ref={
          onButtonTag !== undefined
            ? (ref) => onButtonTag(findNodeHandleTagOf(ref))
            : undefined
        }
      >
        <Text style={[styles.buttonText, { color: t.textPrimary }]}>{buttonLabel}</Text>
        <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={t.textSecondary} />
      </TvPressable>
      {open && (
        <View style={[styles.panel, { backgroundColor: t.surfaceElevated }]}>
          {seasons.map((season) => {
            const selected = season.id === selectedSeason?.id;
            return (
              <TvPressable
                key={season.id}
                focusKind="row"
                focusable
                hasTVPreferredFocus={selected}
                accessibilityRole="menuitem"
                accessibilityLabel={seasonLabelOf(season, numberLabel, specialLabel)}
                onPress={() => {
                  setOpen(false);
                  onSelect(season);
                }}
                style={styles.panelItem}
              >
                <Text
                  style={[
                    styles.panelItemText,
                    { color: selected ? t.accent : t.textPrimary },
                  ]}
                >
                  {seasonLabelOf(season, numberLabel, specialLabel)}
                </Text>
              </TvPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  buttonText: { fontSize: 18, fontWeight: '600' },
  panel: {
    borderRadius: 12,
    padding: 8,
    minWidth: 180,
    maxWidth: 320,
    elevation: 8,
    zIndex: 10,
  },
  panelItem: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  panelItemText: { fontSize: 17 },
});
