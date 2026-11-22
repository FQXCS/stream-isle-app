/**
 * 全局播放队列弹层（迷你条「队列」按钮，M5 文档 §4.10 改版）：
 * 半屏底部面板原地覆盖当前页面，不再跳转 Now Playing 详情页；
 * 点遮罩 / 系统返回关闭；「清空队列」只移除当前曲以外的待播曲目，播放与迷你条保留。
 * 面板高度与 NowPlaying 内队列面板同口径（屏高 55%），内容复用 QueuePanel。
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/component/useTheme';
import { SHEET_RADIUS, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import { QueuePanel } from '@/page/nowplaying/components/QueuePanel';

interface QueueSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function QueueSheet({ visible, onClose }: QueueSheetProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* DraggableFlatList 在 Modal 内需要独立的手势根视图（RNGH Android 限制） */}
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.root}>
          {/* 队列外的整屏可点区域：点任意面板外位置收起队列 */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel={tr('queue.collapseSheet')}
          />
          <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
            <QueuePanel />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1 },
    /** 遮罩透明：队列面板直接叠在当前页面上，不压暗背景（点遮罩仍可收起） */
    root: { flex: 1, justifyContent: 'flex-end' },
    panel: {
      height: '55%',
      backgroundColor: t.surface,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      overflow: 'hidden',
    },
  });
