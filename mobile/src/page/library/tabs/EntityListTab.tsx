/**
 * 实体列表 Tab（类型/标签/播出平台/游戏系统/插件频道）：实体行点击进通用条目列表。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntitySummary } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { useTheme } from '@/component/useTheme';
import type { TabSpec } from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import type { RootStackParamList } from '@/page/navigation/types';
import {
  loadEntityPage,
  type EntityListKind,
} from '@/service/LibraryBrowseService';

type EntityNavigation = NativeStackNavigationProp<RootStackParamList>;

interface EntityListTabProps {
  tab: TabSpec;
  libraryId: string;
}

function entityKindOf(tab: TabSpec): EntityListKind | null {
  if (tab.special === 'genres') {
    return 'genres';
  }
  if (tab.special === 'tags') {
    return 'tags';
  }
  if (tab.special === 'studios') {
    return 'studios';
  }
  if (tab.special === 'pluginChannels') {
    return 'pluginChannels';
  }
  if (tab.kinds?.includes('GameSystem') === true) {
    return 'gameSystems';
  }
  return null;
}

export function EntityListTab({ tab, libraryId }: EntityListTabProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<EntityNavigation>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const kind = entityKindOf(tab);
  const state = usePagedLoad<EntitySummary>(
    useCallback(
      (page) =>
        kind === null
          ? Promise.resolve({ items: [], total: 0, startIndex: 0 })
          : loadEntityPage(kind, libraryId, tab.kinds ?? [], page),
      [kind, libraryId, tab.kinds]
    )
  );

  const handlePress = useCallback(
    (entity: EntitySummary) => {
      if (kind === 'genres') {
        navigation.navigate(ROUTES.ITEM_LIST, {
          title: entity.name,
          parentId: libraryId,
          kinds: tab.kinds !== undefined ? [...tab.kinds] : undefined,
          genreIds: [entity.id],
        });
        return;
      }
      if (kind === 'tags') {
        navigation.navigate(ROUTES.ITEM_LIST, {
          title: entity.name,
          parentId: libraryId,
          kinds: tab.kinds !== undefined ? [...tab.kinds] : undefined,
          tagFilters: [{ id: entity.id, name: entity.name }],
        });
        return;
      }
      if (kind === 'studios') {
        navigation.navigate(ROUTES.ITEM_LIST, {
          title: entity.name,
          parentId: libraryId,
          kinds: tab.kinds !== undefined ? [...tab.kinds] : undefined,
          studioIds: [entity.id],
        });
        return;
      }
      if (kind === 'gameSystems') {
        navigation.navigate(ROUTES.ITEM_LIST, {
          title: entity.name,
          parentId: entity.id,
          kinds: ['Game'],
        });
        return;
      }
      if (kind === 'pluginChannels') {
        navigation.navigate(ROUTES.ITEM_LIST, {
          title: entity.name,
          channelId: entity.id,
        });
      }
    },
    [kind, libraryId, navigation, tab.kinds]
  );

  if (kind === null) {
    return <EmptyView title={tr('library.unsupportedCategory')} />;
  }
  if (state.errorCode !== null && state.itemList.length === 0) {
    return <ErrorView error={new AppError(state.errorCode)} onRetry={state.retry} />;
  }
  if (state.page < 0 && state.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (state.itemList.length === 0) {
    return <EmptyView title={tr('library.emptyContent')} />;
  }
  return (
    <FlashList
      data={state.itemList}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: EntitySummary }) => (
        <Pressable style={styles.row} onPress={() => handlePress(item)}>
          {item.imageUrl !== undefined ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              recyclingKey={item.id}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.fallbackText}>{item.name.slice(0, 1) || '#'}</Text>
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {item.childCount !== undefined && (
            <Text style={styles.count}>{item.childCount}</Text>
          )}
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onEndReached={state.loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        state.loading && state.page > 0 ? (
          <ActivityIndicator style={styles.footer} color={t.accent} />
        ) : null
      }
      contentContainerStyle={[
        styles.content,
        { paddingBottom: SPACING.xl + miniPlayerPadding },
      ]}
    />
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    content: { paddingHorizontal: SPACING.l, paddingBottom: SPACING.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.m,
      paddingVertical: SPACING.s,
      minHeight: 56,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.bg },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    fallbackText: { color: t.textSecondary, fontSize: FONT_SIZE.title },
    name: { flex: 1, color: t.textPrimary, fontSize: FONT_SIZE.body },
    count: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.separator,
    },
    footer: { paddingVertical: SPACING.l },
  });
