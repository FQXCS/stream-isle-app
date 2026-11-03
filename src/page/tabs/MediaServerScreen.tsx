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
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
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

/** 卡片底色（参考稿：Emby 浅绿 / Jellyfin 浅紫，半透明叠加在主题底色上） */
const FLAVOR_CARD_TINT: Record<ServerFlavor, string> = {
  EMBY: 'rgba(82, 181, 75, 0.14)',
  JELLYFIN: 'rgba(112, 88, 214, 0.14)',
};

export function MediaServerScreen() {
  const t = useTheme();
  const styles = createStyles(t);
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
      showToast(ok ? '详情数据已刷新' : '刷新失败，请检查服务器连接', ok ? 'info' : 'error');
    },
    [refreshStatsOf]
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
      failedCount > 0 ? `刷新完成，${failedCount} 台失败` : '全部服务器详情已刷新',
      failedCount > 0 ? 'error' : 'info'
    );
  }, [refreshStatsOf, servers]);

  const cardServer = servers.find((server) => server.serverId === cardServerId);
  const cardMenuItemList: AnchorMenuItem[] =
    cardServer === undefined
      ? []
      : [
          {
            key: 'edit',
            label: '编辑',
            icon: 'edit',
            onPress: () =>
              navigation.navigate(ROUTES.SERVER_ADD, { mode: 'edit', serverId: cardServer.serverId }),
          },
          {
            key: 'routes',
            label: '线路管理',
            icon: 'routes',
            onPress: () =>
              navigation.navigate(ROUTES.SERVER_ROUTES, { serverId: cardServer.serverId }),
          },
          {
            key: 'refresh',
            label: '刷新详情数据',
            icon: 'refresh',
            onPress: () => void handleRefreshStats(cardServer.serverId),
          },
          {
            key: 'private',
            label: cardServer.private === true ? '取消隐私服务器' : '设为隐私服务器',
            icon: 'eyeOff',
            onPress: () =>
              useAccountStore
                .getState()
                .actions.setServerPrivate(cardServer.serverId, cardServer.private !== true),
          },
          {
            key: 'tls',
            label: allowInsecureTls.includes(cardServer.baseUrl)
              ? '取消忽略证书校验'
              : '忽略证书校验',
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
            label: '删除',
            icon: 'trash',
            tone: 'danger',
            onPress: () => {
              Alert.alert('删除服务器', `确定删除「${cardServer.serverName}」及其全部账号吗？`, [
                { text: '取消', style: 'cancel' },
                {
                  text: '删除',
                  style: 'destructive',
                  onPress: () => {
                    void useAccountStore.getState().actions.removeServer(cardServer.serverId);
                  },
                },
              ]);
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
      label: '编辑',
      icon: 'edit',
      disabled: servers.length === 0,
      onPress: () => {
        setSelectedIds(new Set());
        setSelectMode(true);
      },
    },
    {
      key: 'sort',
      label: '排序',
      icon: 'sort',
      disabled: servers.length < 2,
      onPress: () => navigation.navigate(ROUTES.SERVER_SORT),
    },
    {
      key: 'refreshAll',
      label: '刷新全部',
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
    Alert.alert('删除服务器', `确定删除选中的 ${idList.length} 台服务器及其账号吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
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
    ]);
  }, [selectedIds, servers]);

  const openAddMenu = () => {
    addButtonRef.current?.measureInWindow((x, y, width, height) =>
      setAddAnchor({ x, y, width, height })
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        {selectMode ? (
          <View style={styles.headerButton} />
        ) : (
          <Pressable
            ref={addButtonRef}
            accessibilityRole="button"
            accessibilityLabel="添加服务器"
            hitSlop={8}
            onPress={openAddMenu}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <AppIcon name="plus" size={24} color={t.textPrimary} />
          </Pressable>
        )}
        <Text style={styles.title}>影视服务器</Text>
        {selectMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="完成"
            hitSlop={8}
            onPress={exitSelectMode}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Text style={[styles.doneText, { color: t.textPrimary }]}>完成</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="更多操作"
            hitSlop={8}
            onPress={(event) =>
              setPageAnchor({
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
                width: 1,
                height: 1,
              })
            }
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <AppIcon name="more" size={24} color={t.textPrimary} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={servers}
        keyExtractor={(item) => item.serverId}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.listContent, selectMode && styles.listContentSelectMode]}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>还没有添加服务器</Text>
            <Text style={styles.emptyHint}>点左上角「+」添加 Emby / Jellyfin 服务器</Text>
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
                { width: cardWidth, backgroundColor: FLAVOR_CARD_TINT[item.flavor] },
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
                  isActive && <View style={[styles.activeDot, { backgroundColor: t.accent }]} />
                )}
              </View>
              <Text style={styles.cardName} numberOfLines={1}>
                {masked ? '••••' : item.serverName || '未命名服务器'}
              </Text>
              <Text style={styles.cardUrl} numberOfLines={1}>
                {masked ? '••••••••' : item.baseUrl}
              </Text>
              <Text style={styles.cardStats} numberOfLines={1}>
                电影: {item.stats?.movieCount ?? '-'} 剧集: {item.stats?.seriesCount ?? '-'}
              </Text>
              <View style={styles.cardBottom}>
                <Text style={styles.cardFlavor}>
                  {item.flavor === 'EMBY' ? 'Emby' : 'Jellyfin'}
                </Text>
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
            accessibilityLabel="删除所选服务器"
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
              删除
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
              accessibilityLabel={allSelected ? '取消全选' : '全选'}
              hitSlop={8}
              style={styles.selectSide}
              onPress={toggleSelectAll}
            >
              <Text style={[styles.selectAction, { color: t.accent }]}>
                {allSelected ? '取消全选' : '全选'}
              </Text>
            </Pressable>
            <Text style={[styles.selectCount, { color: t.textSecondary }]}>
              已选择 {selectedCount} 项
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
      paddingHorizontal: SPACING.m,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.m,
      // 参考稿：头部做成独立条带（surface 底 + 阴影/分隔线），与内容区明显分层
      backgroundColor: t.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.separator,
      elevation: 4,
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
    },
    headerButton: { padding: SPACING.s },
    doneText: { fontSize: FONT_SIZE.body, fontWeight: '600' },
    title: { color: t.textPrimary, fontSize: FONT_SIZE.header, fontWeight: '700' },
    listContent: { padding: SPACING.l, paddingTop: SPACING.xl, gap: SPACING.m, flexGrow: 1 },
    /** 编辑模式下底部工具条占位，避免最后一行卡片被挡 */
    listContentSelectMode: { paddingBottom: 190 },
    column: { gap: SPACING.m },
    card: {
      borderRadius: POSTER_RADIUS,
      padding: SPACING.l,
      gap: SPACING.xs,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    activeDot: { width: 8, height: 8, borderRadius: 4 },
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
    cardName: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '700' },
    cardUrl: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
    cardStats: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
    cardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.m,
    },
    cardFlavor: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1, fontWeight: '600' },
    cardTime: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.s, paddingTop: '40%' },
    emptyTitle: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
    emptyHint: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    pressed: { opacity: 0.7 },
  });
