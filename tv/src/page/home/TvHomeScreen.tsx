/**
 * TV 首页（TV-m1 §4.4）：数据链路与手机 LibrariesScreen 同构——
 * 三区（继续观看/下一集/最新添加）+ 我的媒体（库卡片行）+ 每库「默认 Tab 条件最新添加」行。
 * 态：加载（骨架占位）/ 错误（重试 D-pad 可达，文案走共享 errorMessageOf）/ 分区级空隐藏；
 * 游客态不在本屏处理（TV gate 保证 active 存在，登出由 gate 自动回登录屏，TV-m1-S1）。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MediaLibrary, MediaLibraryItem } from '@/adapter/model';
import { AppError } from '@/infra/error';
import { AppIcon } from '@/component/AppIcon';
import { useT } from '@/i18n';
import type { ThemeTokens } from '@/constant/theme';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TvEmptyView, TvErrorView, TvLoadingSkeleton } from '@tv/component/TvStateViews';
import { TvPressable } from '@tv/component/TvPressable';
import type { PageLoadStatus } from '@/util/pageState';
import { resolveLibraryLatestQuery } from '@/util/libraryConfig';
import { applyManageOverride } from '@/util/libraryManage';
import { homeService, type HomeSections } from '@/service/HomeService';
import { librariesKeyOf, useBrowseStore } from '@/store/browseStore';
import { useAccountStore, useActiveServerFlavor } from '@/store/accountStore';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { useLibraryManageStore } from '@/store/libraryManageStore';

import { TvLibraryTile } from '@tv/page/home/TvLibraryTile';
import { TvMediaRow, TvRowEscapeSentinel } from '@tv/page/home/TvMediaRow';
import { TvSidebarProxy } from '@tv/component/TvSidebarProxy';
import { findNodeHandleTagOf } from '@tv/util/focusView';

interface TvHomeScreenProps {
  /** 侧栏镜像代理的图标/文案（Shell 当前 tab 下发） */
  proxyIcon: Parameters<typeof AppIcon>[0]['name'];
  proxyLabel: string;
  /** 代理实例 tag 上抛（跳板 nextFocusUp 寻址；代理须挂本 ScrollView 内才可达） */
  onProxyTag(tag: number | null): void;
  /** 代理 CENTER 动作（Shell tab 循环切换，见 TvNavigator cycleTab 注释） */
  onProxyPress(): void;
  /** 跳板 nextFocusUp 的目标（即代理 tag，Shell 下发回环） */
  escapeFocusUpTag?: number;
}

export function TvHomeScreen({ proxyIcon, proxyLabel, onProxyTag, onProxyPress, escapeFocusUpTag }: TvHomeScreenProps) {
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles(t);
  const active = useAccountStore((state) => state.active);
  const key = active !== null ? librariesKeyOf(active.serverId, active.userId) : null;
  const libraries = useBrowseStore((state) =>
    key !== null ? state.librariesByKey[key] : undefined
  );
  // 媒体管理本地覆盖（显隐/顺序）：与手机融合页同口径
  const manageOverride = useLibraryManageStore((state) =>
    key !== null ? state.overrideByKey[key] : undefined
  );
  // 每库行查询条件跟随设置页「同类型服务器配置」里的默认 Tab（flavor + 用户覆盖）
  const flavor = useActiveServerFlavor();
  const tabListByScope = useLibraryDisplayStore((state) => state.tabListByScope);
  const defaultTabByScope = useLibraryDisplayStore((state) => state.defaultTabByScope);

  const [status, setStatus] = useState<PageLoadStatus>('loading');
  const [sections, setSections] = useState<HomeSections | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  /** 每库横向行的最新添加条目（libraryId → 前 LIBRARY_ROW_LIMIT 条） */
  const [libraryItemMap, setLibraryItemMap] = useState<Record<string, MediaLibraryItem[]>>({});
  /** 「我的媒体」行首跳板 tag（行首卡 nextFocusLeft 寻址，TV-m1 边缘逃逸） */
  const [myMediaSentinelTag, setMyMediaSentinelTag] = useState<number | null>(null);

  /** 首页三区并发拉取：任一失败整页失败 → 重试态（验收 #9） */
  const loadHome = useCallback(async () => {
    try {
      const loaded = await homeService.loadHome();
      setSections(loaded);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
      setStatus('error');
    }
  }, []);

  /** 库列表就绪后并发拉每库最新添加（查询条件 = 该库默认 Tab；单库失败隐藏该行） */
  const loadLibraryRows = useCallback(
    async (libraryList: readonly MediaLibrary[]) => {
      const queryList = libraryList.flatMap((library) => {
        const query = resolveLibraryLatestQuery({
          flavor,
          libraryType: library.type,
          tabOverrides: tabListByScope,
          preferredTabByScope: defaultTabByScope,
        });
        return query === null ? [] : [{ libraryId: library.id, ...query }];
      });
      if (queryList.length === 0) {
        setLibraryItemMap({});
        return;
      }
      const itemMap = await homeService.loadLibraryLatest(queryList);
      setLibraryItemMap(itemMap);
    },
    [flavor, tabListByScope, defaultTabByScope]
  );

  /** 聚焦加载：三区 + 库列表并发，随后拉每库行（tab 切换重挂本屏时重拉，browseStore 有缓存） */
  const loadAll = useCallback(async () => {
    if (active === null) {
      return;
    }
    await Promise.all([
      loadHome(),
      key !== null ? useBrowseStore.getState().actions.loadLibraries(key) : Promise.resolve(),
    ]);
    if (key === null) {
      return;
    }
    const libraryList = applyManageOverride(
      useBrowseStore.getState().librariesByKey[key] ?? [],
      useLibraryManageStore.getState().overrideByKey[key]
    );
    if (libraryList.length > 0) {
      await loadLibraryRows(libraryList);
    }
  }, [active, key, loadHome, loadLibraryRows]);

  // 聚焦加载（手机 useFocusEffect 同口径）：tab 切换重挂本屏时重拉（browseStore 有库列表缓存）
  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  /** 顶部刷新按钮（server.refreshHome；D-pad 替代手机下拉刷新） */
  const handleRefresh = useCallback(() => {
    setStatus('loading');
    void loadAll();
  }, [loadAll]);

  if (status === 'loading') {
    return (
      <View style={[styles.fill, styles.pad]}>
        <View style={styles.header}>
          <Text style={[styles.pageTitle, { color: t.textPrimary }]}>{tr('tv.tabHome')}</Text>
        </View>
        <TvLoadingSkeleton />
      </View>
    );
  }

  if (status === 'error' && error !== null) {
    return (
      <View style={styles.fill}>
        <TvErrorView error={error} onRetry={() => void loadHome()} />
      </View>
    );
  }

  if (sections === null) {
    return null;
  }

  const libraryList = applyManageOverride(libraries ?? [], manageOverride);
  // 库列表未返回前不判定页面空，避免闪一下「暂无内容」
  const pageEmpty =
    libraries !== undefined &&
    sections.resumeList.length === 0 &&
    sections.nextUpList.length === 0 &&
    sections.latestList.length === 0 &&
    libraryList.length === 0;

  // 首屏焦点落第一个非空分区第一卡（验收 #6）：渲染序声明式判定首个非空行
  // （resume → nextUp → latest → 我的媒体；每库行在同列表下方，仅在无前序行时可能出现，
  // 实际必被「我的媒体」行覆盖，不参与领取）
  const autoFocusKey =
    sections.resumeList.length > 0
      ? 'resume'
      : sections.nextUpList.length > 0
        ? 'nextUp'
        : sections.latestList.length > 0
          ? 'latest'
          : libraryList.length > 0
            ? 'myMedia'
            : null;

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      {/* 侧栏镜像代理：纵向 ScrollView 子树内（跳板 arrowScroll findUserSetNextFocus 可达），
          常态隐形 1dp 不占布局（absolute）；跳板 LEFT→UP 到达后 CENTER/RIGHT 交互 */}
      <TvSidebarProxy icon={proxyIcon} label={proxyLabel} onTag={onProxyTag} onPress={onProxyPress} />
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: t.textPrimary }]}>{tr('tv.tabHome')}</Text>
        <TvPressable
          focusKind="row"
          focusable
          accessibilityRole="button"
          accessibilityLabel={tr('server.refreshHome')}
          onPress={handleRefresh}
          style={styles.refreshButton}
        >
          <AppIcon name="refresh" size={22} color={t.textPrimary} />
        </TvPressable>
      </View>
      {pageEmpty ? (
        <TvEmptyView
          title={tr('server.libraryEmptyTitle')}
          subtitle={tr('server.libraryEmptySubtitle')}
        />
      ) : (
        <>
          {sections.resumeList.length > 0 && (
            <TvMediaRow
              title={tr('server.sectionResume')}
              itemList={sections.resumeList}
              variant="wide"
              autoFocusFirst={autoFocusKey === 'resume'}
            />
          )}
          {sections.nextUpList.length > 0 && (
            <TvMediaRow
              title={tr('server.sectionNextUp')}
              itemList={sections.nextUpList}
              autoFocusFirst={autoFocusKey === 'nextUp'}
            />
          )}
          {sections.latestList.length > 0 && (
            <TvMediaRow
              title={tr('server.sectionLatest')}
              itemList={sections.latestList}
              autoFocusFirst={autoFocusKey === 'latest'}
            />
          )}
          {libraryList.length > 0 && (
            <View style={styles.row}>
              <Text style={[styles.rowTitle, { color: t.textPrimary }]}>
                {tr('server.sectionMyMedia')}
              </Text>
              <FlatList
                horizontal
                data={libraryList}
                keyExtractor={(library) => library.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                // 元素形式（组件类型稳定，不触发 FlatList 卸载重挂；箭头函数组件会导致 ref 重放循环）
                ListHeaderComponent={
                  <TvRowEscapeSentinel
                    label={tr('server.sectionMyMedia')}
                   
                    onRef={(ref) => {
                      const tag = findNodeHandleTagOf(ref);
                      setMyMediaSentinelTag((prev) => (prev === tag ? prev : tag));
                    }}
                  />
                }
                renderItem={({ item, index }) => (
                  <TvLibraryTile
                    library={item}
                    hasTVPreferredFocus={index === 0 && autoFocusKey === 'myMedia'}
                    nextFocusLeft={
                      index === 0 && myMediaSentinelTag !== null ? myMediaSentinelTag : undefined
                    }
                  />
                )}
              />
            </View>
          )}
          {libraryList.map((library) => {
            const itemList = libraryItemMap[library.id] ?? [];
            if (itemList.length === 0) {
              return null;
            }
            return (
              <TvMediaRow
                key={library.id}
                title={library.name}
                itemList={itemList}
               
              />
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1 },
    pad: { paddingHorizontal: 16, paddingTop: 4 },
    content: { gap: 28, paddingBottom: 24 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    pageTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3 },
    refreshButton: {
      borderRadius: 999,
      padding: 12,
      backgroundColor: t.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.textSecondary,
    },
    row: { gap: 14 },
    rowTitle: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16 },
    rowContent: { paddingHorizontal: 16, gap: 16 },
  });
