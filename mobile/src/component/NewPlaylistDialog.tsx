/**
 * 歌单名称输入弹窗（音乐个人歌单文档 §5.6.3）：
 * 居中 Modal + 名称输入 + 确认/取消。只负责 UI 与名称校验，提交由 onConfirm
 * （返回 Promise，失败保持弹窗打开）由调用方执行。
 * 三个调用方共用：歌单 Tab 头部（新建空歌单）、PlaylistPickerSheet（创建并加入）、
 * 歌单详情 ⋮ 菜单（重命名——title/initialName 换语义，校验规则相同）。
 * **条件挂载**（调用方在 visible 时才渲染）：initialName 作为初始 state，卸载即清态。
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/component/useTheme';
import { CARD_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { PLAYLIST_NAME_MAX_LENGTH } from '@/constant/playlist';
import { useT } from '@/i18n';

interface NewPlaylistDialogProps {
  visible: boolean;
  /** 弹窗标题（新建/重命名各自传入） */
  title: string;
  /** 初始名称（重命名场景传当前歌单名，打开即预填） */
  initialName?: string;
  /** 确认回调（名称已 trim）；Promise reject 时弹窗保持打开 */
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function NewPlaylistDialog({
  visible,
  title,
  initialName = '',
  onConfirm,
  onCancel,
}: NewPlaylistDialogProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const [name, setName] = useState(initialName);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  // 等 Modal 挂载后再聚焦（Android 上立即 focus 不弹键盘）
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const submit = async () => {
    if (submitting) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed === '') {
      setErrorText(tr('playlist.nameEmpty'));
      return;
    }
    if (trimmed.length > PLAYLIST_NAME_MAX_LENGTH) {
      setErrorText(tr('playlist.nameTooLong', { count: PLAYLIST_NAME_MAX_LENGTH }));
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      // 失败（onConfirm 抛错）时保持弹窗打开供改后重试；成功由调用方关弹窗
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errorText !== null) {
                setErrorText(null);
              }
            }}
            placeholder={tr('playlist.namePlaceholder')}
            placeholderTextColor={t.textTertiary}
            maxLength={200}
            editable={!submitting}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
          />
          {errorText !== null && <Text style={styles.error}>{errorText}</Text>}
          <View style={styles.actions}>
            <Pressable style={styles.actionButton} onPress={onCancel} disabled={submitting}>
              <Text style={styles.actionText}>{tr('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.primaryButton]}
              onPress={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>{tr('common.confirm')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    /** 遮罩压暗（输入弹窗与半屏 sheet 不同：需要聚焦输入，压暗突出卡片） */
    card: {
      width: '82%',
      maxWidth: 340,
      backgroundColor: t.surface,
      borderRadius: CARD_RADIUS,
      padding: SPACING.l,
    },
    title: { fontSize: FONT_SIZE.title, color: t.textPrimary, marginBottom: SPACING.m },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      borderRadius: CARD_RADIUS,
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.s,
      fontSize: FONT_SIZE.body,
      color: t.textPrimary,
    },
    error: { marginTop: SPACING.s, fontSize: FONT_SIZE.caption, color: t.danger },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: SPACING.l, gap: SPACING.s },
    actionButton: { paddingHorizontal: SPACING.l, paddingVertical: SPACING.s, borderRadius: CARD_RADIUS },
    primaryButton: { backgroundColor: t.accent },
    actionText: { fontSize: FONT_SIZE.body, color: t.textSecondary },
    primaryText: { fontSize: FONT_SIZE.body, color: '#FFFFFF' },
  });
