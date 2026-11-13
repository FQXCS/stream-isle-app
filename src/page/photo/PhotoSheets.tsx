/**
 * 照片查看器底部弹层（沉浸深色，不随主题；视觉语言对齐 RadioOptionSheet）：
 * - PhotoActionSheet：长按动作面板（查看原图/保存到本地相册/图片信息），替代系统 Alert；
 * - PhotoInfoSheet：图片信息面板（文件名/分辨率/添加日期/发行时间，缺失字段不展示）。
 * 两者均为 Modal + 半透明遮罩点击关闭 + 24 圆角面板 + 顶部抓手 + 安全区底距。
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhotoItem } from '@/adapter/model';
import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { COLORS, FONT_SIZE, SHEET_RADIUS, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { formatDate } from '@/util/format';

interface PhotoActionSheetProps {
  /** 长按目标照片（null=关闭） */
  photo: PhotoItem | null;
  /** 当前是否原图态（决定「查看原图/看缩放图」文案） */
  viewingOriginal: boolean;
  onToggleOriginal: () => void;
  onSave: () => void;
  onInfo: () => void;
  onClose: () => void;
}

/** 长按动作面板：查看原图 / 保存到本地相册 / 图片信息 */
export function PhotoActionSheet({
  photo,
  viewingOriginal,
  onToggleOriginal,
  onSave,
  onInfo,
  onClose,
}: PhotoActionSheetProps) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={photo !== null} transparent animationType="slide" onRequestClose={onClose}>
      {/* 半透明遮罩点击关闭；面板吃掉点击防止冒泡误关 */}
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable
          style={[styles.panel, { paddingBottom: SPACING.l + insets.bottom }]}
          onPress={() => undefined}
        >
          <View style={styles.grabber} />
          <Text style={styles.title} numberOfLines={1}>
            {photo?.fileName ?? photo?.name ?? ''}
          </Text>
          <ActionRow
            icon="image"
            label={viewingOriginal ? tr('photo.viewScaled') : tr('photo.viewOriginal')}
            onPress={onToggleOriginal}
          />
          <ActionRow icon="download" label={tr('photo.save')} onPress={onSave} />
          <ActionRow icon="info" label={tr('photo.info')} onPress={onInfo} />
          <Pressable style={({ pressed }) => [styles.cancelRow, pressed && styles.pressed]} onPress={onClose}>
            <Text style={styles.cancelText}>{tr('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface PhotoInfoSheetProps {
  /** 信息目标照片（null=关闭） */
  photo: PhotoItem | null;
  onClose: () => void;
}

/** 图片信息面板：文件名 / 分辨率 / 添加日期 / 发行时间（缺失字段整行不展示） */
export function PhotoInfoSheet({ photo, onClose }: PhotoInfoSheetProps) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const fileName = photo?.fileName ?? photo?.name;
  const hasResolution = photo?.width !== undefined && photo?.height !== undefined;
  const takenAt = photo?.takenAtMs !== undefined ? formatDate(photo.takenAtMs) : '';
  const releaseDate = photo?.premiereDateMs !== undefined ? formatDate(photo.premiereDateMs) : '';
  return (
    <Modal visible={photo !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable
          style={[styles.panel, { paddingBottom: SPACING.l + insets.bottom }]}
          onPress={() => undefined}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{tr('photo.info')}</Text>
          {fileName !== undefined && <InfoRow label={tr('photo.infoFileName')} value={fileName} />}
          {hasResolution && (
            <InfoRow label={tr('photo.infoResolution')} value={`${photo.width} × ${photo.height}`} />
          )}
          {takenAt !== '' && <InfoRow label={tr('photo.infoDateAdded')} value={takenAt} />}
          {releaseDate !== '' && <InfoRow label={tr('photo.infoReleaseDate')} value={releaseDate} />}
          <Pressable style={({ pressed }) => [styles.cancelRow, pressed && styles.pressed]} onPress={onClose}>
            <Text style={styles.cancelText}>{tr('common.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface ActionRowProps {
  icon: AppIconName;
  label: string;
  onPress: () => void;
}

/** 动作行：图标 + 文案，整行可点 */
function ActionRow({ icon, label, onPress }: ActionRowProps) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
      <AppIcon name={icon} size={20} color={COLORS.textPrimary} />
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
}

/** 信息行：左标签右取值（取值可换行，文件名可能很长） */
function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.s,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: SPACING.xs,
    marginBottom: SPACING.m,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  rowLabel: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body + 1 },
  infoLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body },
  infoValue: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZE.body,
    textAlign: 'right',
  },
  cancelRow: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
    marginTop: SPACING.xs,
  },
  cancelText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body + 1 },
  pressed: { opacity: 0.6 },
});
