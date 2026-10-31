/**
 * 下载状态徽标（M6 文档 §4.4.5）：详情页按钮行与剧集集行共用的五态入口。
 * 五态：无 →「下载」（onStart）/ 下载中 → 百分比（onOpenDownloads）/ 暂停 →「继续」/
 * 完成 →「已下载 · 本地播放」（onPlayLocal）/ 失败 →「重试」。状态全部读 downloadStore；
 * 继续/重试由本组件直呼 downloadService（操作语义收敛一处），发起/本地播放回调由页面提供
 * （发起需要页面上下文拼 DownloadableItem，本地播放需要导航）。
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text } from 'react-native';

import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { errorMessageOf } from '@/infra/error';
import type { RootStackParamList } from '@/page/navigation/types';
import { downloadService } from '@/service/DownloadService';
import { showToast } from '@/component/Toast';
import { useDownloadStore } from '@/store/downloadStore';

interface DownloadBadgeProps {
  itemId: string;
  /** 发起下载（页面捕获 DownloadableItem 闭包） */
  onStart: () => void;
  /** 完成态 tap：构造本地会话进播放页（页面提供导航上下文） */
  onPlayLocal: () => void;
  /** 紧凑态（集行右侧图标位；按钮行省略） */
  compact?: boolean;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function DownloadBadge({ itemId, onStart, onPlayLocal, compact = false }: DownloadBadgeProps) {
  const t = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const task = useDownloadStore((state) => state.taskMap[itemId]);

  const label = (): string => {
    if (task === undefined) {
      return compact ? '⬇' : '下载';
    }
    switch (task.status) {
      case 'queued':
      case 'downloading': {
        const total = task.totalBytes ?? 0;
        const percent =
          total > 0 ? Math.min(99, Math.round((task.progressBytes / total) * 100)) : 0;
        return compact ? `${percent}%` : `下载中 ${percent}%`;
      }
      case 'paused':
        return compact ? '⏸ 继续' : '继续';
      case 'completed':
        return compact ? '▶ 本地' : '已下载 · 本地播放';
      case 'failed':
        return compact ? '⟳ 重试' : '重试';
      default:
        return compact ? '⬇' : '下载';
    }
  };

  const handlePress = (): void => {
    if (task === undefined) {
      onStart();
      return;
    }
    switch (task.status) {
      case 'queued':
      case 'downloading':
        // 下载中 tap → 跳下载页（06 §4.4.5）
        navigation.navigate(ROUTES.DOWNLOADS);
        break;
      case 'paused':
        void downloadService.resumeDownload(itemId).catch((err: unknown) => {
          showToast(err instanceof Error ? errorMessageOf('UNKNOWN') : '继续失败', 'error');
        });
        break;
      case 'completed':
        onPlayLocal();
        break;
      case 'failed':
        void downloadService.retryDownload(itemId).catch(() => {
          showToast(errorMessageOf('UNKNOWN'), 'error');
        });
        break;
      default:
        onStart();
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        pressed && styles.pressed,
        task !== undefined && task.status === 'completed' && { backgroundColor: t.success },
      ]}
      onPress={handlePress}
    >
      <Text style={[styles.text, compact && styles.textCompact]}>{label()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: {
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pressed: { opacity: 0.7 },
  text: { color: '#FFFFFF', fontSize: FONT_SIZE.body },
  textCompact: { fontSize: FONT_SIZE.body - 2 },
});
