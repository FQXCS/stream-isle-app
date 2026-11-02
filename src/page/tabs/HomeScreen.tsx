/**
 * 首页（04 文档 §3 认领补齐，M1 占位页填充；设计文档 §7.1；M6 §4.10 历史入口）：
 * 继续观看 / 下一集 / 最新添加三区横向卡片行，下拉刷新；头部右侧「历史」图标 → History
 * （06 文档 §4.4.5 首页头部入口）。
 * 页面状态按 PageLoadStatus 约定（04 §4.2）：页面级失败 ErrorView、页面级空 EmptyView、
 * 分区级空隐藏分区。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppError } from '@/infra/error';
import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { PosterRow } from '@/component/PosterRow';
import { FONT_SIZE, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import type { RootStackParamList } from '@/page/navigation/types';
import type { HomeSections } from '@/service/HomeService';
import { homeService } from '@/service/HomeService';
import type { PageLoadStatus } from '@/util/pageState';

/** 三区标题（首页固定三区，标题收敛本文件） */
const SECTION_TITLES = {
  resume: '继续观看',
  nextUp: '下一集',
  latest: '最新添加',
} as const;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const t = useTheme();
  const navigation = useNavigation<NavigationProp>();
  // 页面状态机（04 §4.2 PageLoadStatus）：empty 由三区全空推导落位
  const [status, setStatus] = useState<PageLoadStatus>('loading');
  const [sections, setSections] = useState<HomeSections | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadHome = useCallback(async () => {
    try {
      const loaded = await homeService.loadHome();
      setSections(loaded);
      setError(null);
      const pageEmpty =
        loaded.resumeList.length === 0 &&
        loaded.nextUpList.length === 0 &&
        loaded.latestList.length === 0;
      setStatus(pageEmpty ? 'empty' : 'ready');
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
      setStatus('error');
    }
  }, []);

  // 聚焦即刷新（切 Tab 回首页、账号切换后整体刷新）
  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome])
  );

  /** 下拉刷新（已就绪时保留旧数据避免闪屏） */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadHome();
    } finally {
      setRefreshing(false);
    }
  }, [loadHome]);

  if (status === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <LoadingView />
      </View>
    );
  }

  if (status === 'error' && error !== null) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <ErrorView error={error} onRetry={() => void loadHome()} />
      </View>
    );
  }

  if (sections === null) {
    return null;
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: t.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.accent} />
      }
    >
      {/* 头部（M1 占位标题 + M6 §4.10 历史入口图标） */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: t.textPrimary }]}>首页</Text>
        <Pressable
          hitSlop={8}
          onPress={() => navigation.navigate(ROUTES.HISTORY)}
          style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
          accessibilityLabel="观看历史"
        >
          <AppIcon name="history" size={22} color={t.textPrimary} />
        </Pressable>
      </View>
      {status === 'empty' ? (
        // 页面级空：三区全空（04 §4.2）
        <EmptyView title="首页暂无内容" subtitle="去媒体库看看，或播放一部影片后回来" />
      ) : (
        <>
          {sections.resumeList.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>{SECTION_TITLES.resume}</Text>
              <PosterRow itemList={sections.resumeList} />
            </View>
          )}
          {sections.nextUpList.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>{SECTION_TITLES.nextUp}</Text>
              <PosterRow itemList={sections.nextUpList} />
            </View>
          )}
          {sections.latestList.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>{SECTION_TITLES.latest}</Text>
              <PosterRow itemList={sections.latestList} />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: SPACING.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.xl,
  },
  headerTitle: { fontSize: FONT_SIZE.header, fontWeight: '700' },
  historyButton: { padding: SPACING.s },
  pressed: { opacity: 0.7 },
  section: { marginTop: SPACING.l, gap: SPACING.m },
  sectionTitle: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    paddingHorizontal: SPACING.l,
  },
});
