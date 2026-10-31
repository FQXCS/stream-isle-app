/**
 * 人物卡（M2 文档 §4.1）：圆形头像 + 姓名/饰演角色，详情页演员横滑行消费。
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { PersonRef } from '@/adapter/model';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

interface PersonCardProps {
  person: PersonRef;
}

export function PersonCard({ person }: PersonCardProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.card}>
      <View style={styles.headBox}>
        {person.headImageUrl !== undefined ? (
          <Image
            source={{ uri: person.headImageUrl }}
            style={styles.head}
            contentFit="cover"
            transition={200}
            recyclingKey={person.id}
          />
        ) : (
          <View style={[styles.head, styles.headFallback]}>
            <Text style={styles.fallbackText}>{person.name.slice(0, 1)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {person.name}
      </Text>
      {person.role !== undefined && (
        <Text style={styles.role} numberOfLines={1}>
          {person.role}
        </Text>
      )}
    </View>
  );
}

const HEAD_SIZE = 72;

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  card: { width: HEAD_SIZE + SPACING.l, alignItems: 'center', gap: 2 },
  headBox: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: t.surface,
    marginBottom: SPACING.xs,
  },
  head: { width: '100%', height: '100%' },
  headFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: t.textSecondary, fontSize: FONT_SIZE.header },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.body, maxWidth: HEAD_SIZE + SPACING.l },
  role: { color: t.textSecondary, fontSize: FONT_SIZE.body, maxWidth: HEAD_SIZE + SPACING.l },
});
