/**
 * 媒体库 Tab（首页与媒体库融合页，参考截图样式）：
 * 继续观看（16:9 大卡）→ 下一集 → 最近添加（海报行）→ 我的媒体（库卡片横滑，
 * 右上「查看全部」进入全部库列表）→ 每个库一行「默认 Tab 条件的最新添加前 20」+「查看全部」。
 * 行内卡片固定高度、宽度按图幅自适应（海报 2:3 / 剧照 16:9 / 方形 1:1），混排时行高一致。
 * 页面状态沿用 PageLoadStatus 约定（04 §4.2）：页面级失败 ErrorView + 重试、
 * 页面级空 EmptyView、分区级空隐藏分区；头部右侧为搜索（原底部 Tab）与观看历史入口（06 §4.4.5）。
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ComponentRef, ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MediaLibrary, MediaLibraryItem } from '@/adapter/model';
import { AppError } from '@/infra/error';
import { AnchorMenu, type AnchorMenuItem, type AnchorRect } from '@/component/AnchorMenu';
import { AppIcon } from '@/component/AppIcon';
import { ServerFlavorLogo } from '@/component/ServerFlavorLogo';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { PosterRow } from '@/component/PosterRow';
import { showToast } from '@/component/Toast';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import { MEDIA_CARD_HEIGHT } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { LibraryTile } from '@/page/tabs/components/LibraryTile';
import { ResumeRow } from '@/page/tabs/components/ResumeRow';
import { homeService, type HomeSections } from '@/service/HomeService';
import { librariesKeyOf, useBrowseStore } from '@/store/browseStore';
import { useAccountStore, useActiveServerFlavor } from '@/store/accountStore';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';
import { useLibraryManageStore } from '@/store/libraryManageStore';
import { resolveLibraryLatestQuery } from '@/util/libraryConfig';
import { applyManageOverride } from '@/util/libraryManage';
import { cardAspectRatioOf } from '@/util/mediaCard';
import type { PageLoadStatus } from '@/util/pageState';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SectionGroupProps {
  title: string;
  /** 右上「查看全部」动作（缺省不显示） */
  onMore?: () => void;
  children: ReactNode;
}

/** 分区容器：标题 + 可选「查看全部」+ 内容（各行自带左右留白） */
function SectionGroup({ title, onMore, children }: SectionGroupProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onMore !== undefined && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('server.viewAllOf', { title })}
            hitSlop={8}
            onPress={onMore}
            style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
          >
            <Text style={styles.moreText}>{tr('server.viewAll')}</Text>
            <AppIcon name="chevronRight" size={14} color={t.textSecondary} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

export function LibrariesScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  // 迷你条浮在 Tab 栏上方：底部让位，内容不被条子覆盖（停止播放后自动归零）
  const miniPadding = useMiniPlayerPadding();
  // 自绘大标题需避让状态栏（edge-to-edge 下内容延伸进状态栏区域）
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const active = useAccountStore((state) => state.active);
  const serverList = useAccountStore((state) => state.servers);
  const activeServer = serverList.find((server) => server.serverId === active?.serverId);
  const key = active ? librariesKeyOf(active.serverId, active.userId) : null;
  const libraries = useBrowseStore((state) => (key !== null ? state.librariesByKey[key] : undefined));
  // 媒体管理本地覆盖（显隐/顺序）：服务器不应用 MyMediaExcludes 时本机兜底
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
  const [refreshing, setRefreshing] = useState(false);
  /** 每库横向行的最新添加条目（libraryId → 前 LIBRARY_ROW_LIMIT 条） */
  const [libraryItemMap, setLibraryItemMap] = useState<Record<string, MediaLibraryItem[]>>({});
  /** 服务器切换菜单锚点（null = 关闭） */
  const [switcherAnchor, setSwitcherAnchor] = useState<AnchorRect | null>(null);
  const serverPillRef = useRef<ComponentRef<typeof View> | null>(null);
  /** 游客态「添加服务器」的类型选择菜单锚点 */
  const [guestAddAnchor, setGuestAddAnchor] = useState<AnchorRect | null>(null);
  const guestAddRef = useRef<ComponentRef<typeof View> | null>(null);

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

  /** 聚焦/下拉统一刷新：首页三区 + 库列表并发，随后拉每库最新添加行 */
  const loadAll = useCallback(async () => {
    if (active === null) {
      // 未登录（游客态）：不请求任何需要 Token 的接口
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

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  /** 下拉刷新：与聚焦刷新同链路（含每库行） */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  /** 库卡片/「查看全部」：进入库页（与 M1 库入口一致） */
  const handlePressLibrary = useCallback(
    (library: MediaLibrary) => {
      navigation.navigate(ROUTES.LIBRARY, { library });
    },
    [navigation]
  );

  /**
   * 每库行条目点击：按条目类型进对应页——专辑/艺人与歌单走各自的详情页，
   * 歌曲/相册/照片/游戏等没有独立页面的类型回退到库页（在库内继续浏览）。
   */
  const handlePressLibraryItem = useCallback(
    (item: MediaLibraryItem, library: MediaLibrary) => {
      switch (item.type) {
        case 'MusicAlbum':
          navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'album', itemId: item.id });
          return;
        case 'MusicArtist':
          navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'artist', itemId: item.id });
          return;
        case 'Playlist':
          navigation.navigate(ROUTES.PLAYLIST_DETAIL, { playlistId: item.id });
          return;
        case 'Audio':
        case 'PhotoAlbum':
        case 'Photo':
        case 'Game':
        case 'Channel':
        case 'TvChannel':
          navigation.navigate(ROUTES.LIBRARY, { library });
          return;
        default:
          navigation.navigate(ROUTES.ITEM, { itemId: item.id });
      }
    },
    [navigation]
  );

  /** 服务器切换菜单：刷新首页 / 媒体管理（预留）/ 各服务器（勾选当前） */
  const switcherMenuItems: AnchorMenuItem[] = [
    { key: 'refresh', label: tr('server.refreshHome'), icon: 'refresh', onPress: () => void loadAll() },
    {
      key: 'manage',
      label: tr('server.mediaManage'),
      icon: 'library',
      onPress: () => navigation.navigate(ROUTES.MEDIA_MANAGE),
    },
    ...serverList
      .filter((server) => server.private !== true)
      .map((server) => ({
        key: `server:${server.serverId}`,
        label: server.serverName || tr('server.unnamedServer'),
        // 参考稿：只有当前服务器带勾选图标，未选中的服务器不显示图标
        icon: (active?.serverId === server.serverId ? 'check' : undefined) as AnchorMenuItem['icon'],
        onPress: () => {
          void (async () => {
            const activated = await useAccountStore
              .getState()
              .actions.activateServer(server.serverId);
            if (!activated) {
              showToast(tr('server.noAccountForServer'), 'error');
            }
          })();
        },
      })),
  ];

  /** 游客态「添加服务器」：先选 Emby / Jellyfin，再进添加表单（表单内不再重复选类型） */
  const guestAddMenuItems: AnchorMenuItem[] = [
    {
      key: 'EMBY',
      label: 'Emby',
      onPress: () => navigation.navigate(ROUTES.SERVER_ADD, { mode: 'add', flavor: 'EMBY' }),
    },
    {
      key: 'JELLYFIN',
      label: 'Jellyfin',
      onPress: () => navigation.navigate(ROUTES.SERVER_ADD, { mode: 'add', flavor: 'JELLYFIN' }),
    },
  ];

  // 游客态：未添加服务器也可进入 App，媒体库为空并引导添加
  if (active === null) {
    return (
      <>
        <View style={[styles.fill, styles.guestBox, { backgroundColor: t.bg }]}>
          <View style={styles.guestIconBox}>
            <AppIcon name="server" size={30} color={t.accent} />
          </View>
          <Text style={styles.guestTitle}>{tr('server.guestTitle')}</Text>
          <Text style={styles.guestHint}>{tr('server.guestHint')}</Text>
          <Pressable
            ref={guestAddRef}
            accessibilityRole="button"
            accessibilityLabel={tr('server.addServer')}
            onPress={() =>
              guestAddRef.current?.measureInWindow((x, y, width, height) =>
                setGuestAddAnchor({ x, y, width, height })
              )
            }
            style={({ pressed }) => [styles.guestButton, pressed && styles.pressed]}
          >
            <Text style={styles.guestButtonText}>{tr('server.addServer')}</Text>
          </Pressable>
        </View>
        <AnchorMenu
          anchor={guestAddAnchor}
          itemList={guestAddMenuItems}
          onClose={() => setGuestAddAnchor(null)}
        />
      </>
    );
  }

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

  const libraryList = applyManageOverride(libraries ?? [], manageOverride);
  // 库列表未返回前不判定页面空，避免闪一下「暂无内容」
  const pageEmpty =
    libraries !== undefined &&
    sections.resumeList.length === 0 &&
    sections.nextUpList.length === 0 &&
    sections.latestList.length === 0 &&
    libraryList.length === 0;

  return (
    <>
      <ScrollView
        style={[styles.fill, { backgroundColor: t.bg, marginBottom: miniPadding }]}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.l }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.accent} />
        }
      >
        <View style={styles.header}>
          {/* 大标题 + 右侧搜索/历史入口（亮色下建立页面层级） */}
          <View style={styles.headerTop}>
            <Text style={styles.pageTitle}>{tr('nav.tabLibrary')}</Text>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('nav.search')}
                hitSlop={8}
                onPress={() => navigation.navigate(ROUTES.SEARCH)}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              >
                <AppIcon name="search" size={22} color={t.textPrimary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('settings.history')}
                hitSlop={8}
                onPress={() => navigation.navigate(ROUTES.HISTORY)}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              >
                <AppIcon name="history" size={22} color={t.textPrimary} />
              </Pressable>
            </View>
          </View>
          {/* 媒体库服务器切换（当前服务器名 + 下拉） */}
          <Pressable
            ref={serverPillRef}
            accessibilityRole="button"
            accessibilityLabel={tr('server.switchServer')}
            onPress={() =>
              serverPillRef.current?.measureInWindow((x, y, width, height) =>
                setSwitcherAnchor({ x, y, width, height })
              )
            }
            style={({ pressed }) => [styles.serverPill, pressed && styles.pressed]}
          >
            {/* 左上角胶囊图标：当前服务器类型（Emby / Jellyfin 官方标志） */}
            <View style={styles.serverPillLogo}>
              <ServerFlavorLogo flavor={activeServer?.flavor ?? 'EMBY'} size={18} />
            </View>
            {/* 名称单行省略；flexShrink 保证省略号紧贴实际边界，不带多余空白 */}
            <Text style={styles.serverPillText} numberOfLines={1} ellipsizeMode="tail">
              {activeServer?.serverName || tr('server.unnamedServer')}
            </Text>
            <View style={styles.serverPillChevron}>
              <AppIcon name="chevronDown" size={16} color={t.textSecondary} />
            </View>
          </Pressable>
        </View>
      {pageEmpty ? (
        <EmptyView
          title={tr('server.libraryEmptyTitle')}
          subtitle={tr('server.libraryEmptySubtitle')}
        />
      ) : (
        <>
          {sections.resumeList.length > 0 && (
            <SectionGroup title={tr('server.sectionResume')}>
              <ResumeRow itemList={sections.resumeList} />
            </SectionGroup>
          )}
          {sections.nextUpList.length > 0 && (
            <SectionGroup title={tr('server.sectionNextUp')}>
              <PosterRow
                itemList={sections.nextUpList}
                cardHeight={MEDIA_CARD_HEIGHT}
                aspectRatioOf={(item) => cardAspectRatioOf(item.type)}
              />
            </SectionGroup>
          )}
          {sections.latestList.length > 0 && (
            <SectionGroup title={tr('server.sectionLatest')}>
              <PosterRow itemList={sections.latestList} cardHeight={MEDIA_CARD_HEIGHT} />
            </SectionGroup>
          )}
          {libraryList.length > 0 && (
            <SectionGroup
              title={tr('server.sectionMyMedia')}
              onMore={() => navigation.navigate(ROUTES.LIBRARY_LIST)}
            >
              <FlatList
                horizontal
                data={libraryList}
                keyExtractor={(library) => library.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.libraryRow}
                renderItem={({ item }) => (
                  <LibraryTile library={item} onPress={handlePressLibrary} />
                )}
              />
            </SectionGroup>
          )}
          {libraryList.map((library) => {
            const itemList = libraryItemMap[library.id] ?? [];
            if (itemList.length === 0) {
              return null;
            }
            return (
              <SectionGroup
                key={library.id}
                title={library.name}
                onMore={() => handlePressLibrary(library)}
              >
                <PosterRow
                  itemList={itemList}
                  cardHeight={MEDIA_CARD_HEIGHT}
                  aspectRatioOf={(item) => cardAspectRatioOf(item.type)}
                  onPressItem={(item) => handlePressLibraryItem(item, library)}
                />
              </SectionGroup>
            );
          })}
        </>
      )}
      </ScrollView>
      <AnchorMenu
        anchor={switcherAnchor}
        itemList={switcherMenuItems}
        onClose={() => setSwitcherAnchor(null)}
      />
    </>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1 },
    content: { paddingTop: SPACING.l, paddingBottom: SPACING.xl, gap: SPACING.l },
    header: { paddingHorizontal: SPACING.l, gap: SPACING.m },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pageTitle: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.display,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    headerButton: {
      padding: SPACING.s,
      borderRadius: 999,
      backgroundColor: t.surface,
    },
    /** 服务器切换胶囊（标题下方） */
    serverPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '72%',
      backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      borderRadius: 999,
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.s,
    },
    serverPillLogo: { marginRight: SPACING.s },
    serverPillText: {
      flexShrink: 1,
      color: t.textPrimary,
      fontSize: FONT_SIZE.body,
      fontWeight: '600',
    },
    serverPillChevron: { marginLeft: SPACING.xs },
    guestBox: { alignItems: 'center', justifyContent: 'center', gap: SPACING.m, padding: SPACING.xl },
    guestIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentSoft,
      marginBottom: SPACING.xs,
    },
    guestTitle: { color: t.textPrimary, fontSize: FONT_SIZE.section, fontWeight: '700' },
    guestHint: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 300,
    },
    guestButton: {
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.m,
      marginTop: SPACING.s,
    },
    guestButtonText: { color: t.accentOn, fontSize: FONT_SIZE.body, fontWeight: '600' },
    pressed: { opacity: 0.7 },
    section: { gap: SPACING.m },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.l,
    },
    sectionTitle: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.section,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    moreButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    moreText: { color: t.accent, fontSize: FONT_SIZE.body - 1, fontWeight: '500' },
    libraryRow: { paddingHorizontal: SPACING.l, gap: SPACING.m },
  });
