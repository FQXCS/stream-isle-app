/**
 * 歌单选择器半屏 sheet（音乐个人歌单文档 §5.6.3）：
 * 歌曲行长按「加入歌单」与专辑详情「加入歌单」共用——列出个人歌单（全局查询，
 * 曲目数副标题）+ 顶部「新建歌单并加入」。点行即加入（不查重，服务器允许重复）。
 * 结构对齐 QueueSheet：Modal + 独立手势根视图（RNGH Android 限制）。
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MediaLibraryItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { NewPlaylistDialog } from '@/component/NewPlaylistDialog';
import { showCenterToast, showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { FONT_SIZE, SHEET_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError, errorMessageOf } from '@/infra/error';
import { useT } from '@/i18n';
import { fetchMusicPlaylistPage } from '@/service/BrowseService';
import { playlistService } from '@/service/PlaylistService';

interface PlaylistPickerSheetProps {
  visible: boolean;
  /** 待加入的条目 id（单曲/专辑/多选批量列表，服务器自动展开专辑） */
  itemIdsToAdd: string[];
  onClose: () => void;
  /** 任一加入成功（点已有歌单 / 新建并加入）后的回调（多选场景退出多选态） */
  onAdded?: () => void;
}

/** 操作失败 Toast（文案取错误码映射唯一出处） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

export function PlaylistPickerSheet({
  visible,
  itemIdsToAdd,
  onClose,
  onAdded,
}: PlaylistPickerSheetProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const insets = useSafeAreaInsets();
  const [itemList, setItemList] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // 挂载即拉取个人歌单列表（setState 全在异步续体；常驻挂载 + visible 控制显示，
  // 再次打开时先显示上次数 据、拉取完成后静默刷新，歌单列表变化频率低可接受）
  useEffect(() => {
    let cancelled = false;
    fetchMusicPlaylistPage(0)
      .then((page) => {
        if (!cancelled) {
          setItemList(page.items);
        }
      })
      .catch(() => {
        // 拉取失败列表留空（错误不阻塞「新建歌单并加入」路径），行内不展示错误横幅
        if (!cancelled) {
          setItemList([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 加入已有歌单：成功居中提示 + onAdded + 关 sheet；失败 toast（403 无权限等）保持打开 */
  const addTo = async (playlist: MediaLibraryItem) => {
    if (addingId !== null) {
      return;
    }
    setAddingId(playlist.id);
    try {
      await playlistService.addToPlaylist(playlist.id, itemIdsToAdd);
      showCenterToast(tr('playlist.added', { name: playlist.name }));
      onAdded?.();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setAddingId(null);
    }
  };

  /** 新建并加入：NewPlaylistDialog 校验后的回调 */
  const createAndAdd = async (name: string) => {
    try {
      await playlistService.createPlaylist(name, itemIdsToAdd);
      showCenterToast(tr('playlist.createdAndAdded', { name }));
      onAdded?.();
      setCreating(false);
      onClose();
    } catch (err) {
      toastError(err);
      throw err;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.root}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
            <Text style={styles.title}>{tr('playlist.addToPlaylist')}</Text>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={t.accent} />
              </View>
            ) : (
              <FlatList
                data={itemList}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.row}
                    onPress={() => void addTo(item)}
                    disabled={addingId !== null}
                  >
                    <AppIcon name="playlist" size={20} color={t.textSecondary} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.childCount !== undefined && (
                        <Text style={styles.rowSub}>
                          {tr('playlist.trackCount', { count: item.childCount })}
                        </Text>
                      )}
                    </View>
                    {addingId === item.id && <ActivityIndicator size="small" color={t.accent} />}
                  </Pressable>
                )}
                ListHeaderComponent={
                  <Pressable style={styles.row} onPress={() => setCreating(true)}>
                    <AppIcon name="playlistPlus" size={20} color={t.accent} />
                    <Text style={[styles.rowName, styles.createText]}>
                      {tr('playlist.newPlaylistAndAdd')}
                    </Text>
                  </Pressable>
                }
                ListEmptyComponent={
                  <Text style={styles.empty}>{tr('playlist.empty')}</Text>
                }
                contentContainerStyle={styles.listContent}
              />
            )}
          </View>
        </View>
      </GestureHandlerRootView>
      {creating && (
        <NewPlaylistDialog
          visible
          title={tr('playlist.newPlaylist')}
          onConfirm={createAndAdd}
          onCancel={() => setCreating(false)}
        />
      )}
    </Modal>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1 },
    root: { flex: 1, justifyContent: 'flex-end' },
    panel: {
      height: '55%',
      backgroundColor: t.surface,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      overflow: 'hidden',
    },
    title: {
      fontSize: FONT_SIZE.title,
      color: t.textPrimary,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.m,
    },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { paddingBottom: SPACING.l },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.m,
    },
    rowText: { flex: 1 },
    rowName: { fontSize: FONT_SIZE.body, color: t.textPrimary },
    rowSub: { fontSize: FONT_SIZE.caption, color: t.textTertiary, marginTop: 2 },
    createText: { color: t.accent },
    empty: {
      fontSize: FONT_SIZE.body,
      color: t.textTertiary,
      textAlign: 'center',
      paddingVertical: SPACING.xl,
    },
  });
