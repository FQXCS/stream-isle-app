/**
 * 媒体管理（服务器菜单进入）：全量媒体库列表，行 = 左拖拽把手（顺序）+ 库名 + 右勾选框（显隐），
 * 右上「保存」写本地覆盖并尽力同步服务器 UserConfiguration（OrderedViews/MyMediaExcludes）；
 * 服务器不支持时本地兜底生效。返回不保存则丢弃本次调整。无修改时保存置灰不可点。
 */
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibrary } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { DragHandle } from '@/component/DragHandle';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { SortableSettingsList } from '@/component/SortableSettingsList';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { CARD_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import { AppError } from '@/infra/error';
import type { RootStackParamList } from '@/page/navigation/types';
import { fetchManageState, saveManageState, type ManageState } from '@/service/MediaManageService';
import type { PageLoadStatus } from '@/util/pageState';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.MEDIA_MANAGE>;

export function MediaManageScreen({ navigation }: Props) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const [status, setStatus] = useState<PageLoadStatus>('loading');
  const [error, setError] = useState<AppError | null>(null);
  const [orderedList, setOrderedList] = useState<MediaLibrary[]>([]);
  const [hiddenIdList, setHiddenIdList] = useState<string[]>([]);
  // 加载完成时的基线快照，用于判定是否有修改（无修改保存置灰）
  const [baseline, setBaseline] = useState<ManageState | null>(null);
  const [saving, setSaving] = useState(false);

  /** 加载全量库 + 生效顺序/显隐（本地覆盖优先，缺省服务器配置）；初始 status 即 loading，不在 effect 内同步 setState */
  const load = useCallback(async () => {
    try {
      const state = await fetchManageState();
      setOrderedList(state.orderedLibraryList);
      setHiddenIdList(state.hiddenIdList);
      setBaseline(state);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
      setStatus('error');
    }
  }, []);

  // 聚焦即加载（与 HistoryScreen 等页同惯例）
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /** 切换某库显隐（隐藏行仍可拖拽排序） */
  const handleToggle = useCallback((libraryId: string) => {
    setHiddenIdList((prev) =>
      prev.includes(libraryId) ? prev.filter((id) => id !== libraryId) : [...prev, libraryId]
    );
  }, []);

  /** 是否有修改：顺序按 id 序列比，显隐按集合比（勾选来回切换不算修改） */
  const dirty = useMemo(() => {
    if (baseline === null) {
      return false;
    }
    const orderChanged =
      orderedList.length !== baseline.orderedLibraryList.length ||
      orderedList.some((library, index) => library.id !== baseline.orderedLibraryList[index].id);
    const hiddenChanged =
      hiddenIdList.length !== baseline.hiddenIdList.length ||
      hiddenIdList.some((id) => !baseline.hiddenIdList.includes(id));
    return orderChanged || hiddenChanged;
  }, [baseline, orderedList, hiddenIdList]);

  /** 保存：本地覆盖立即生效 + 尽力服务器同步；同步失败提示仅本机生效 */
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const synced = await saveManageState(
        orderedList.map((library) => library.id),
        hiddenIdList
      );
      if (!synced) {
        showToast(tr('server.mediaManageLocalOnly'));
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }, [navigation, orderedList, hiddenIdList, tr]);

  // 无修改或保存中：置灰不可点
  const saveDisabled = saving || !dirty;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('common.save')}
          accessibilityState={{ disabled: saveDisabled }}
          disabled={saveDisabled}
          onPress={() => void handleSave()}
        >
          <Text style={[styles.headerAction, saveDisabled && styles.headerActionDisabled]}>
            {tr('common.save')}
          </Text>
        </Pressable>
      ),
    });
  }, [handleSave, navigation, saveDisabled, styles.headerAction, styles.headerActionDisabled, tr]);

  if (status === 'loading') {
    return <LoadingView />;
  }
  if (status === 'error' && error !== null) {
    return (
      <ErrorView
        error={error}
        onRetry={() => {
          setStatus('loading');
          void load();
        }}
      />
    );
  }

  return (
    <SortableSettingsList
      data={orderedList}
      keyExtractor={(library) => library.id}
      onReorder={setOrderedList}
      header={<Text style={styles.hint}>{tr('server.mediaManageHint')}</Text>}
      renderItem={(library, drag, index) => {
        const checked = !hiddenIdList.includes(library.id);
        return (
          <View
            style={[
              styles.row,
              index === 0 && styles.rowFirst,
              index === orderedList.length - 1 && styles.rowLast,
              index < orderedList.length - 1 && styles.rowDivider,
            ]}
          >
            <DragHandle onLongPress={drag} />
            <Pressable
              style={styles.labelArea}
              onPress={() => handleToggle(library.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={library.name}
            >
              <Text style={styles.label} numberOfLines={1}>
                {library.name}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={library.name}
              hitSlop={SPACING.s}
              onPress={() => handleToggle(library.id)}
            >
              <AppIcon
                name={checked ? 'checkboxChecked' : 'checkboxUnchecked'}
                size={22}
                color={checked ? t.accent : t.textTertiary}
              />
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    headerAction: { color: t.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600' },
    headerActionDisabled: { color: t.textTertiary },
    hint: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body - 1,
      paddingHorizontal: SPACING.s,
      marginBottom: SPACING.s,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.s,
      backgroundColor: t.surface,
      paddingHorizontal: SPACING.m,
      minHeight: 52,
    },
    rowFirst: { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
    rowLast: { borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.separator,
    },
    labelArea: { flex: 1 },
    label: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  });