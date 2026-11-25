/**
 * TV 人物卡（TV-m2 §2.1）：圆形头像 + 姓名（手机 PersonCard 的 TV 版，自绘禁入 @/component）。
 * 详情页演员行（PersonRef.headImageUrl）与搜索结果人物组（MediaLibraryItem.posterImageUrl，
 * Person 条目主图即头像）共用；头像 URL 由调用方传 adapter 拼好的认证地址。
 * 焦点视觉经 TvPressable card 态收口；Enter 动作由调用方下发（onSelect 回调收口路由）。
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';

/** 头像直径（10-foot 尺度；手机 64dp 的 TV 档） */
export const TV_PERSON_HEAD_SIZE = 110;

interface TvPersonCardProps {
  /** 最小形状：两种来源（PersonRef / MediaLibraryItem）投影后共用 */
  person: { id: string; name: string; imageUrl?: string };
  onSelect(): void;
  /** 首屏首卡持焦点（可选） */
  hasTVPreferredFocus?: boolean;
  /** LEFT 显式焦点目标（行首卡指向跳板 tag，TV-m1 边缘逃逸机制） */
  nextFocusLeft?: number;
}

export function TvPersonCard({
  person,
  onSelect,
  hasTVPreferredFocus = false,
  nextFocusLeft,
}: TvPersonCardProps) {
  const t = useTvTheme();
  return (
    <TvPressable
      focusKind="card"
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={person.name}
      onPress={onSelect}
      style={styles.card}
      nextFocusLeft={nextFocusLeft}
    >
      <View style={[styles.headBox, { backgroundColor: t.surfaceSunken }]}>
        {person.imageUrl !== undefined ? (
          <Image
            source={{ uri: person.imageUrl }}
            style={styles.head}
            contentFit="cover"
            transition={150}
            recyclingKey={person.id}
          />
        ) : (
          <View style={[styles.head, styles.headFallback]}>
            <Text style={[styles.headFallbackText, { color: t.textSecondary }]}>
              {person.name.slice(0, 1)}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
        {person.name}
      </Text>
    </TvPressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, width: TV_PERSON_HEAD_SIZE + 10 },
  headBox: {
    width: TV_PERSON_HEAD_SIZE,
    height: TV_PERSON_HEAD_SIZE,
    borderRadius: TV_PERSON_HEAD_SIZE / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  head: { width: '100%', height: '100%' },
  headFallback: { alignItems: 'center', justifyContent: 'center' },
  headFallbackText: { fontSize: 36, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
