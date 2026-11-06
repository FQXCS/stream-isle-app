/**
 * 影视服务器 Tab（原「媒体服务器」页按参考稿重做）：
 * 服务器卡片列表（名称/地址/电影剧集数量/协议/最近使用时间），
 * 左上「+」添加 Emby/Jellyfin，右上「⋯」刷新全部；
 * 卡片点击 = 切换服务器，长按 = 编辑 / 线路管理 / 刷新详情数据 / 隐私服务器 / 添加账号 / 删除。
 * 未登录也可使用本页：添加服务器后自动登录并激活，媒体库随之有内容。
 */
import { useCallback, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ComponentRef } from 'react';

import type { ServerFlavor } from '@/adapter/model';
import { AnchorMenu, type AnchorMenuItem, type AnchorRect } from '@/component/AnchorMenu';
import { AppIcon } from '@/component/AppIcon';
import { ServerFlavorLogo } from '@/component/ServerFlavorLogo';
import { showToast } from '@/component/Toast';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { useT } from '@/i18n';
import { ActiveServerDot } from '@/page/tabs/components/ActiveServerDot';
import {
  CARD_RADIUS,
  CARD_SHADOW,
  FONT_SIZE,
  SPACING,
  type ThemeTokens,
} from '@/constant/theme';
import type { RootStackParamList } from '@/page/navigation/types';
import { refreshServerStats } from '@/service/ServerService';
import { useAccountStore, type ServerAccount } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatRelativeTime } from '@/util/format';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 添加服务器可选类型（参考稿仅 Emby / Jellyfin） */
const ADD_FLAVOR_OPTIONS: readonly { flavor: ServerFlavor; label: string }[] = [
  { flavor: 'EMBY', label: 'Emby' },
  { flavor: 'JELLYFIN', label: 'Jellyfin' },
];

export function MediaServerScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  // 迷你条浮在 Tab 栏上方：底部让位，卡片不被条子覆盖（停止播放后自动归零）
  const miniPadding = useMiniPlayerPadding();
  const navigation = useNavigation<NavigationProp>();
  const servers = useAccountStore((state) => state.servers);
  const active = useAccountStore((state) => state.active);
  const allowInsecureTls = useSettingsStore((state) => state.allowInsecureTls);
  const addButtonRef = useRef<ComponentRef<typeof View> | null>(null);
  // 卡片宽度固定为两列宽（不用 flex 撑满）：只有一台服务器时保持半屏宽，不放大
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - SPACING.l * 2 - SPACING.m) / 2;

  const [addAnchor, setAddAnchor] = useState<AnchorRect | null>(null);
  const [pageAnchor, setPageAnchor] = useState<AnchorRect | null>(null);
  const [cardAnchor, setCardAnchor] = useState<AnchorRect | null>(null);
  const [cardServerId, setCardServerId] = useState<string | null>(null);
  /** 编辑（多选）模式：卡片点按改为勾选，底部出现删除/全选工具条 */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  /** 切换服务器：无账号时引导去登录（同服务器多用户入口） */
  const handleActivate = useCallback(
    async (server: ServerAccount) => {
      if (active?.serverId === server.serverId) {
        return;
      }
      const activated = await useAccountStore.getState().actions.activateServer(server.serverId);
      if (!activated) {
        navigation.navigate(ROUTES.ONBOARDING_LOGIN, { serverId: server.serverId });
      }
    },
    [active?.serverId, navigation]
  );

  /** 刷新详情数据：统计电影/剧集数量并写入缓存（内部不提示，批量刷新只提示一次） */
  const refreshStatsOf = useCallback(async (serverId: string) => {
    try {
      await refreshServerStats(serverId);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleRefreshStats = useCallback(
    async (serverId: string) => {
      const ok = await refreshStatsOf(serverId);
      showToast(
        ok ? tr('server.statsRefreshed') : tr('server.statsRefreshFailed'),
        ok ? 'info' : 'error'
      );
    },
    [refreshStatsOf, tr]
  );

  const addFlavor = useCallback(
    (flavor: ServerFlavor) => {
      navigation.navigate(ROUTES.SERVER_ADD, { mode: 'add', flavor });
    },
    [navigation]
  );

  const handleRefreshAll = useCallback(async () => {
    if (servers.length === 0) {
      return;
    }
    const resultList = await Promise.all(servers.map((server) => refreshStatsOf(server.serverId)));
    const failedCount = resultList.filter((ok) => !ok).length;
    showToast(
      failedCount > 0
        ? tr('server.refreshAllPartial', { failed: failedCount })
        : tr('server.refreshAllDone'),
      failedCount > 0 ? 'error' : 'info'
    );
  }, [refreshStatsOf, servers, tr]);

  const cardServer = servers.find((server) => server.serverId === cardServerId);
  const cardMenuItemList: AnchorMenuItem[] =
    cardServer === undefined
      ? []
      : [
          {
            key: 'edit',
            label: tr('server.edit'),
            icon: 'edit',
            onPress: () =>
              navigation.navigate(ROUTES.SERVER_ADD, { mode: 'edit', serverId: cardServer.serverId }),
          },
          {
            key: 'routes',
            label: tr('server.menuRoutes'),
            icon: 'routes',
            onPress: () =>
              navigation.navigate(ROUTES.SERVER_ROUTES, { serverId: cardServer.serverId }),
          },
          {
            key: 'refresh',
            label: tr('server.menuRefreshStats'),
            icon: 'refresh',
            onPress: () => void handleRefreshStats(cardServer.serverId),
          },
          {
            key: 'private',
            label:
              cardServer.private === true
                ? tr('server.menuUnsetPrivate')
                : tr('server.menuSetPrivate'),
            icon: 'eyeOff',
            onPress: () =>
              useAccountStore
                .getState()
                .actions.setServerPrivate(cardServer.serverId, cardServer.private !== true),
          },
          {
            key: 'tls',
            label: allowInsecureTls.includes(cardServer.baseUrl)
              ? tr('server.menuUnignoreTls')
              : tr('server.menuIgnoreTls'),
            icon: 'lock',
            onPress: () => {
              const settingsActions = useSettingsStore.getState().actions;
              settingsActions.setInsecureTlsAllowed(
                cardServer.baseUrl,
                !allowInsecureTls.includes(cardServer.baseUrl)
              );
            },
          },
          {
            key: 'delete',
            label: tr('common.delete'),
            icon: 'trash',
            tone: 'danger',
            onPress: () => {
              Alert.alert(
                tr('server.deleteTitle'),
                tr('server.deleteConfirm', { name: cardServer.serverName }),
                [
                  { text: tr('common.cancel'), style: 'cancel' },
                  {
                    text: tr('common.delete'),
                    style: 'destructive',
                    onPress: () => {
                      void useAccountStore.getState().actions.removeServer(cardServer.serverId);
                    },
                  },
                ]
              );
            },
          },
        ];

  const addMenuItemList: AnchorMenuItem[] = ADD_FLAVOR_OPTIONS.map((option) => ({
    key: option.flavor,
    label: option.label,
    // 参考稿：添加类型菜单为纯文字项，不带右侧图标
    onPress: () => addFlavor(option.flavor),
  }));

  const pageMenuItemList: AnchorMenuItem[] = [
    {
      key: 'edit',
      label: tr('server.edit'),
      icon: 'edit',
      disabled: servers.length === 0,
      onPress: () => {
        setSelectedIds(new Set());
        setSelectMode(true);
      },
    },
    {
      key: 'sort',
      label: tr('server.sortTitle'),
      icon: 'sort',
      disabled: servers.length < 2,
      onPress: () => navigation.navigate(ROUTES.SERVER_SORT),
    },
    {
      key: 'refreshAll',
      label: tr('server.menuRefreshAll'),
      icon: 'refresh',
      onPress: () => void handleRefreshAll(),
    },
  ];

  /** 编辑（多选）模式下的选中状态与删除 */
  const selectedCount = selectedIds.size;
  const allSelected = servers.length > 0 && selectedCount === servers.length;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((serverId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((previous) =>
      previous.size === servers.length
        ? new Set()
        : new Set(servers.map((server) => server.serverId))
    );
  }, [servers]);

  const handleDeleteSelected = useCallback(() => {
    const idList = servers
      .filter((server) => selectedIds.has(server.serverId))
      .map((server) => server.serverId);
    if (idList.length === 0) {
      return;
    }
    Alert.alert(
      tr('server.deleteTitle'),
      tr('server.deleteSelectedConfirm', { count: idList.length }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              for (const serverId of idList) {
                const exists = useAccountStore
                  .getState()
                  .servers.some((server) => server.serverId === serverId);
                if (exists) {
                  await useAccountStore.getState().actions.removeServer(serverId);
                }
              }
              setSelectMode(false);
              setSelectedIds(new Set());
            })();
          },
        },
      ]
    );
  }, [selectedIds, servers, tr]);

  const openAddMenu = () => {
    addButtonRef.current?.measureInWindow((x, y, width, height) =>
      setAddAnchor({ x, y, width, height })
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg, paddingBottom: miniPadding }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{tr('nav.tabMediaServer')}</Text>
        <View style={styles.headerActions}>
          {selectMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('server.done')}
              hitSlop={8}
              onPress={exitSelectMode}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Text style={[styles.doneText, { color: t.accent }]}>{tr('server.done')}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                ref={addButtonRef}
                accessibilityRole="button"
                accessibilityLabel={tr('server.addServer')}
                hitSlop={8}
                onPress={openAddMenu}
                style={({ pressed }) => [
                  styles.headerButton,
                  styles.headerPill,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon name="plus" size={22} color={t.textPrimary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('server.moreActions')}
                hitSlop={8}
                onPress={(event) =>
                  setPageAnchor({
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                    width: 1,
                    height: 1,
                  })
                }
                style={({ pressed }) => [
                  styles.headerButton,
                  styles.headerPill,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon name="more" size={22} color={t.textPrimary} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <FlatList
        data={servers}
        keyExtractor={(item) => item.serverId}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.listContent, selectMode && styles.listContentSelectMode]}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconBox}>
              <AppIcon name="server" size={30} color={t.accent} />
            </View>
            <Text style={styles.emptyTitle}>{tr('server.emptyTitle')}</Text>
            <Text style={styles.emptyHint}>{tr('server.emptyHint')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const masked = item.private === true;
          const isActive = active?.serverId === item.serverId;
          const isSelected = selectedIds.has(item.serverId);
          return (
            <Pressable
              onPress={() => {
                if (selectMode) {
                  toggleSelect(item.serverId);
                  return;
                }
                void handleActivate(item);
              }}
              onLongPress={
                selectMode
                  ? undefined
                  : (event) => {
                      setCardServerId(item.serverId);
                      setCardAnchor({
                        x: event.nativeEvent.pageX,
                        y: event.nativeEvent.pageY,
                        width: 1,
                        height: 1,
                      });
                    }
              }
              style={({ pressed }) => [
                styles.card,
                { width: cardWidth, backgroundColor: t.surface },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.cardTop}>
                <ServerFlavorLogo flavor={item.flavor} size={34} />
                {selectMode ? (
                  isSelected ? (
                    <AppIcon name="check" size={20} color={t.accent} />
                  ) : (
                    <View style={[styles.selectCircle, { borderColor: t.textTertiary }]} />
                  )
                ) : (
                  isActive && <ActiveServerDot />
                )}
              </View>
              <Text style={styles.cardName} numberOfLines={1}>
                {masked ? '••••' : item.serverName || tr('server.unnamedServer')}
              </Text>
              <Text style={styles.cardUrl} numberOfLines={1}>
                {masked ? '••••••••' : item.baseUrl}
              </Text>
              <Text style={styles.cardStats} numberOfLines={1}>
                {tr('server.cardStats', {
                  movies: item.stats?.movieCount ?? '-',
                  series: item.stats?.seriesCount ?? '-',
                })}
              </Text>
              <View style={styles.cardBottom}>
                <View style={styles.flavorRow}>
                  <View
                    style={[
                      styles.flavorDot,
                      { backgroundColor: item.flavor === 'EMBY' ? '#52B54B' : '#AA5CC3' },
                    ]}
                  />
                  <Text style={styles.cardFlavor}>
                    {item.flavor === 'EMBY' ? 'Emby' : 'Jellyfin'}
                  </Text>
                </View>
                <Text style={styles.cardTime}>{formatRelativeTime(item.lastUsedAt)}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {selectMode && (
        <View style={styles.selectFooter} pointerEvents="box-none">
          {/* 删除按钮（参考稿：白底红字 + 垃圾桶图标，悬浮在工具条上方） */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('server.deleteSelected')}
            disabled={selectedCount === 0}
            onPress={handleDeleteSelected}
            style={({ pressed }) => [
              styles.deletePill,
              { backgroundColor: t.surfaceElevated },
              selectedCount === 0 && styles.disabledCard,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.deleteText,
                { color: selectedCount === 0 ? t.textTertiary : t.danger },
              ]}
            >
              {tr('common.delete')}
            </Text>
            <AppIcon
              name="trash"
              size={20}
              color={selectedCount === 0 ? t.textTertiary : t.danger}
            />
          </Pressable>
          {/* 底部工具条：全选 / 已选择数（删除只保留上方唯一入口，不重复） */}
          <View style={[styles.selectBar, { backgroundColor: t.surface }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={allSelected ? tr('server.deselectAll') : tr('server.selectAll')}
              hitSlop={8}
              style={styles.selectSide}
              onPress={toggleSelectAll}
            >
              <Text style={[styles.selectAction, { color: t.accent }]}>
                {allSelected ? tr('server.deselectAll') : tr('server.selectAll')}
              </Text>
            </Pressable>
            <Text style={[styles.selectCount, { color: t.textSecondary }]}>
              {tr('server.selectedCount', { count: selectedCount })}
            </Text>
            {/* 右侧占位，保证「已选择」居中 */}
            <View style={styles.selectSide} />
          </View>
        </View>
      )}

      <AnchorMenu anchor={addAnchor} itemList={addMenuItemList} onClose={() => setAddAnchor(null)} />
      <AnchorMenu anchor={pageAnchor} itemList={pageMenuItemList} onClose={() => setPageAnchor(null)} />
      <AnchorMenu
        anchor={cardAnchor}
        itemList={cardMenuItemList}
        onClose={() => {
          setCardAnchor(null);
          setCardServerId(null);
        }}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.l,
      paddingTop: SPACING.l,
      paddingBottom: SPACING.m,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
    headerButton: { padding: SPACING.s },
    /** 头部操作按钮（白底胶囊，与首页搜索/历史按钮同构） */
    headerPill: {
      borderRadius: 999,
      backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
    },
    doneText: { fontSize: FONT_SIZE.body, fontWeight: '600' },
    title: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.display,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    listContent: { padding: SPACING.l, paddingTop: SPACING.m, gap: SPACING.m, flexGrow: 1 },
    /** 编辑模式下底部工具条占位，避免最后一行卡片被挡 */
    listContentSelectMode: { paddingBottom: 190 },
    column: { gap: SPACING.m },
    card: {
      borderRadius: CARD_RADIUS,
      padding: SPACING.l,
      gap: SPACING.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      ...CARD_SHADOW,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
    selectFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: SPACING.l,
      gap: SPACING.s,
    },
    deletePill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.s,
      borderRadius: 999,
      paddingVertical: SPACING.m,
    },
    deleteText: { fontSize: FONT_SIZE.body, fontWeight: '600' },
    disabledCard: { opacity: 0.5 },
    selectBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 999,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.m,
    },
    selectAction: { fontSize: FONT_SIZE.body, fontWeight: '600' },
    selectCount: { fontSize: FONT_SIZE.body },
    selectSide: { minWidth: 64 },
    cardName: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '700', marginTop: 2 },
    cardUrl: { color: t.textTertiary, fontSize: FONT_SIZE.caption },
    cardStats: { color: t.textSecondary, fontSize: FONT_SIZE.caption },
    cardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.m,
    },
    flavorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    flavorDot: { width: 7, height: 7, borderRadius: 4 },
    cardFlavor: { color: t.textSecondary, fontSize: FONT_SIZE.caption, fontWeight: '600' },
    cardTime: { color: t.textTertiary, fontSize: FONT_SIZE.caption },
    emptyBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.s,
      paddingTop: '40%',
    },
    emptyIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentSoft,
      marginBottom: SPACING.xs,
    },
    emptyTitle: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
    emptyHint: { color: t.textSecondary, fontSize: FONT_SIZE.body - 2 },
    pressed: { opacity: 0.7 },
  });
