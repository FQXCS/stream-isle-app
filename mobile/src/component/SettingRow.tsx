/**
 * 设置页通用行组件（M4 文档 §4.5）：标签 + 可选说明 + 右侧值/箭头，整行可点击；
 * 可选左侧头像（圆形，活跃用户行消费，M4 §4.5「头像 + 用户名 @ 服务器名」）。
 * 账号/服务器/播放/关于分区共用，样式收敛一处。
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';

/** 行内头像直径 */
const AVATAR_SIZE = 32;

interface SettingRowProps {
  /** 行标签 */
  label: string;
  /** 可选说明文案（标签下方小字） */
  description?: string;
  /** 可选左侧头像 URL（圆形；无图时回退标签首字占位） */
  avatarUrl?: string;
  /** 右侧值文案（如当前用户名/档位/版本号） */
  value?: string;
  /** 右侧徽标（如 flavor/版本过低警示） */
  badge?: { text: string; danger?: boolean };
  /** 点击回调（不传则不可点） */
  onPress?: () => void;
  /** 右侧是否显示箭头（可点行默认显示） */
  showArrow?: boolean;
}

export function SettingRow({ label, description, avatarUrl, value, badge, onPress, showArrow }: SettingRowProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const content = (
    <>
      {avatarUrl !== undefined ? (
        <View style={styles.avatarBox}>
          {avatarUrl !== '' ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            // 无头像通用占位（避免与标签首字混淆）
            <AppIcon name="account" size={16} color={t.textSecondary} />
          )}
        </View>
      ) : null}
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {description !== undefined && <Text style={styles.description}>{description}</Text>}
      </View>
      <View style={styles.tail}>
        {badge !== undefined && (
          <Text style={[styles.badge, badge.danger && styles.badgeDanger]}>{badge.text}</Text>
        )}
        {value !== undefined && <Text style={styles.value}>{value}</Text>}
        {(showArrow ?? onPress !== undefined) && (
          <AppIcon name="chevronRight" size={16} color={t.textTertiary} />
        )}
      </View>
    </>
  );
  if (onPress === undefined) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
      {content}
    </Pressable>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingVertical: SPACING.s + 2,
    minHeight: 52,
  },
  pressed: { opacity: 0.6 },
  avatarBox: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: t.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: '100%', height: '100%' },
  textWrap: { flex: 1, gap: 3 },
  label: { color: t.textPrimary, fontSize: FONT_SIZE.title - 1, fontWeight: '500' },
  description: {
    color: t.textTertiary,
    fontSize: FONT_SIZE.caption,
    lineHeight: 16,
  },
  tail: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  badge: {
    color: t.accent,
    borderColor: t.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: SPACING.s,
    paddingVertical: 1,
    fontSize: FONT_SIZE.caption - 1,
    overflow: 'hidden',
  },
  badgeDanger: { color: t.warning, borderColor: t.warning },
  value: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1, maxWidth: 160 },
});
