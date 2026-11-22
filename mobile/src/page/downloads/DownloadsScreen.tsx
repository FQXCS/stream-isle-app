/**
 * 下载管理页（M6 文档 §4.4.5；设计文档 §10.2 Downloads 行；路由 Downloads）：
 * 任务列表（本地海报 + 标题/副标题 + 状态行：进度条/大小/失败原因），行内主操作
 * （暂停/继续/重试/播放）+ 次操作（删除，二次确认）；头部总占用；空态「暂无下载」。
 * 数据 = downloadStore（SQLite 内存投影，rehydrate/refreshFromDb 整体刷新）；
 * 错误态复用 ErrorView 不适用（本地数据），加载态即 rehydrate 瞬时（M6 文档 §4.4.5）。
 */
import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { useTheme } from '@/component/useTheme';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useT, type Translator } from '@/i18n';
import { AppError, errorMessageKeyOf, errorMessageOf, isAppErrorCode } from '@/infra/error';
import { ROUTES } from '@/constant/navigation';
import type { RootStackParamList } from '@/page/navigation/types';
import { downloadService } from '@/service/DownloadService';
import { showToast } from '@/component/Toast';
import { useDownloadStore, type DownloadTaskUi } from '@/store/downloadStore';
import { formatBytes } from '@/util/formatBytes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 状态行文案（M6 文档 §4.4.5 状态行） */
function statusText(task: DownloadTaskUi, tr: Translator): string {
  switch (task.status) {
    case 'queued':
      return tr('downloads.queued');
    case 'downloading': {
      const total = task.totalBytes ?? 0;
      return total > 0
        ? tr('downloads.downloading', {
            progress: formatBytes(task.progressBytes),
            total: formatBytes(total),
          })
        : tr('downloads.downloadingProgress', { progress: formatBytes(task.progressBytes) });
    }
    case 'paused':
      return task.totalBytes !== undefined
        ? tr('downloads.pausedOfTotal', {
            progress: formatBytes(task.progressBytes),
            total: formatBytes(task.totalBytes),
          })
        : tr('downloads.paused', { progress: formatBytes(task.progressBytes) });
    case 'completed':
      return task.totalBytes !== undefined
        ? tr('downloads.completedWithSize', { size: formatBytes(task.totalBytes) })
        : tr('downloads.completed');
    case 'failed': {
      // errorMessage 可能是错误码 / 原生错误文本 / 旧数据中文：错误码走字典，其余原样展示
      const raw = task.errorMessage;
      const reason =
        raw === undefined || raw === ''
          ? tr('common.unknownError')
          : isAppErrorCode(raw)
            ? tr(errorMessageKeyOf(raw))
            : raw;
      return tr('downloads.failed', { reason });
    }
    default:
      return '';
  }
}

export function DownloadsScreen() {
  const t = useTheme();
  const tr = useT();
  const navigation = useNavigation<NavigationProp>();
  const taskMap = useDownloadStore((state) => state.taskMap);
  const totalCompletedBytes = useDownloadStore((state) => state.totalCompletedBytes);

  // 聚焦刷新（SQLite → store；详情页发起的下载/断点恢复后回到本页同步，M6 §4.4.4）
  useFocusEffect(
    useCallback(() => {
      void downloadService.refreshFromDb().catch(() => {
        // 本地快照刷新失败不阻塞页面
      });
    }, [])
  );

  const taskList = Object.values(taskMap);

  /** 删除二次确认（M6 §4.4.5 次操作；删除后本地文件与快照行清空，占用归还） */
  const confirmDelete = useCallback(
    (task: DownloadTaskUi) => {
      Alert.alert(
        tr('downloads.deleteTitle'),
        tr('downloads.deleteMessage', { title: task.title }),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('common.delete'),
            style: 'destructive',
            onPress: () => {
              void downloadService.deleteDownload(task.itemId).catch(() => {
                showToast(errorMessageOf('UNKNOWN'), 'error');
              });
            },
          },
        ]
      );
    },
    [tr]
  );

  const mainActionLabel = (task: DownloadTaskUi): string | null => {
    switch (task.status) {
      case 'queued':
      case 'downloading':
        return tr('action.pause');
      case 'paused':
        return tr('action.resume');
      case 'failed':
        return tr('common.retry');
      case 'completed':
        return tr('action.play');
      default:
        return null;
    }
  };

  const handleMainAction = useCallback((task: DownloadTaskUi) => {
    switch (task.status) {
      case 'queued':
      case 'downloading':
        void downloadService.pauseDownload(task.itemId).catch(() => {
          showToast(errorMessageOf('UNKNOWN'), 'error');
        });
        break;
      case 'paused':
        void downloadService.resumeDownload(task.itemId).catch(() => {
          showToast(errorMessageOf('UNKNOWN'), 'error');
        });
        break;
      case 'failed':
        void downloadService.retryDownload(task.itemId).catch(() => {
          showToast(errorMessageOf('UNKNOWN'), 'error');
        });
        break;
      case 'completed':
        void (async () => {
          try {
            const session = await downloadService.buildLocalSession(task.itemId);
            navigation.navigate(ROUTES.PLAYER, { session });
          } catch (err) {
            showToast(
              errorMessageOf(err instanceof AppError ? err.code : 'UNKNOWN'),
              'error'
            );
          }
        })();
        break;
      default:
        break;
    }
  }, [navigation]);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.textPrimary }]}>{tr('downloads.title')}</Text>
      {taskList.length > 0 && (
        <Text style={[styles.usage, { color: t.textSecondary }]}>
          {tr('downloads.usage', { size: formatBytes(totalCompletedBytes) })}
        </Text>
      )}
      {taskList.length === 0 ? (
        <EmptyView
          title={tr('downloads.empty')}
          subtitle={tr('downloads.emptyHint')}
        />
      ) : (
        <FlatList
          data={taskList}
          keyExtractor={(task) => task.itemId}
          renderItem={({ item }) => {
            const mainLabel = mainActionLabel(item);
            const percent =
              item.totalBytes !== undefined && item.totalBytes > 0
                ? Math.min(100, Math.round((item.progressBytes / item.totalBytes) * 100))
                : null;
            return (
              <View style={[styles.row, { backgroundColor: t.surface }]}>
                {item.posterFileUri !== undefined ? (
                  <Image source={{ uri: item.posterFileUri }} style={styles.poster} contentFit="cover" recyclingKey={item.itemId} />
                ) : (
                  <View style={[styles.poster, styles.posterFallback, { backgroundColor: t.surfaceElevated }]}>
                    <AppIcon name="trailer" size={20} color={t.textTertiary} />
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.subtitle !== undefined && (
                    <Text style={[styles.subtitle, { color: t.textSecondary }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.status,
                      { color: item.status === 'failed' ? t.danger : t.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {statusText(item, tr)}
                  </Text>
                  {percent !== null && (item.status === 'downloading' || item.status === 'queued') && (
                    <View style={[styles.progressTrack, { backgroundColor: t.separator }]}>
                      <View
                        style={[styles.progressFill, { width: `${percent}%`, backgroundColor: t.accent }]}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.actions}>
                  {mainLabel !== null && (
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: t.accent }]}
                      onPress={() => handleMainAction(item)}
                    >
                      <Text style={[styles.actionText, { color: t.accentOn }]}>{mainLabel}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: t.surfaceElevated }]}
                    onPress={() => confirmDelete(item)}
                  >
                    <Text style={[styles.actionText, { color: t.danger }]}>
                      {tr('common.delete')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: FONT_SIZE.header, fontWeight: '700', padding: SPACING.l, paddingBottom: SPACING.s },
  usage: { paddingHorizontal: SPACING.l, paddingBottom: SPACING.s, fontSize: FONT_SIZE.body - 2 },
  listContent: { paddingHorizontal: SPACING.l, paddingBottom: SPACING.xl, gap: SPACING.m },
  row: {
    flexDirection: 'row',
    gap: SPACING.m,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.m,
    alignItems: 'center',
  },
  poster: { width: 44, height: 66, borderRadius: 6 },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: FONT_SIZE.body },
  subtitle: { fontSize: FONT_SIZE.body - 2 },
  status: { fontSize: FONT_SIZE.body - 2 },
  progressTrack: { height: 3, borderRadius: 2, marginTop: SPACING.xs, overflow: 'hidden' },
  progressFill: { height: '100%' },
  actions: { gap: SPACING.s, alignItems: 'stretch' },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
  },
  actionText: { fontSize: FONT_SIZE.body - 2 },
});
