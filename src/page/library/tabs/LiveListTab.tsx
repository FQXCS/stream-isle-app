/**
 * LiveTV 列表 Tab：频道/节目/录制内容/计划/系列计划。
 * 频道、节目、录制点击尝试走现有 resolvePlayback 播放；定时器只读展示。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaLibraryItem } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import type { TabSpec } from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { usePagedLoad } from '@/page/library/components/usePagedLoad';
import type { RootStackParamList } from '@/page/navigation/types';
import {
  loadLiveTvPage,
  type LiveListKind,
} from '@/service/LibraryBrowseService';
import { playbackService } from '@/service/PlaybackService';
import type { LibrarySortState } from '@/store/libraryViewStore';

type LiveNavigation = NativeStackNavigationProp<RootStackParamList>;

interface LiveListTabProps {
  tab: TabSpec;
  sort: LibrarySortState;
}

function liveKindOf(tab: TabSpec): LiveListKind | null {
  switch (tab.special) {
    case 'liveChannels':
      return 'channels';
    case 'livePrograms':
      return 'programs';
    case 'liveRecordings':
      return 'recordings';
    case 'liveTimers':
      return 'timers';
    case 'liveSeriesTimers':
      return 'seriesTimers';
    default:
      return null;
  }
}

function emptyTitleOf(kind: LiveListKind): string {
  if (kind === 'channels') {
    return '暂无频道';
  }
  if (kind === 'programs') {
    return '暂无节目';
  }
  if (kind === 'recordings') {
    return '暂无录制';
  }
  if (kind === 'timers') {
    return '暂无计划';
  }
  return '暂无系列计划';
}

function timeOfDay(ms: number): string {
  const date = new Date(ms);
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function timeRangeOf(item: MediaLibraryItem): string | undefined {
  if (item.startMs === undefined) {
    return undefined;
  }
  const start = timeOfDay(item.startMs);
  return item.endMs === undefined ? start : `${start}-${timeOfDay(item.endMs)}`;
}

function subtextOf(item: MediaLibraryItem, kind: LiveListKind): string | undefined {
  if (kind === 'channels') {
    return item.channelNumber !== undefined ? `频道 ${item.channelNumber}` : '频道';
  }
  if (kind === 'programs') {
    const range = timeRangeOf(item);
    return [item.subtext, range].filter((part) => part !== undefined).join(' · ') || undefined;
  }
  const range = timeRangeOf(item);
  if (kind === 'recordings') {
    return [item.status, range].filter((part) => part !== undefined).join(' · ') || '录制';
  }
  return [range, item.status].filter((part) => part !== undefined).join(' · ') || undefined;
}

function sortTimers(items: MediaLibraryItem[], sort: LibrarySortState): MediaLibraryItem[] {
  if (sort.sortBy !== 'START_DATE' && sort.sortBy !== 'SORT_NAME') {
    return items;
  }
  const sorted = [...items].sort((a, b) => {
    if (sort.sortBy === 'START_DATE') {
      return (a.startMs ?? 0) - (b.startMs ?? 0);
    }
    return a.name.localeCompare(b.name);
  });
  return sort.sortOrder === 'ASC' ? sorted : sorted.reverse();
}

export function LiveListTab({ tab, sort }: LiveListTabProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<LiveNavigation>();
  const miniPlayerPadding = useMiniPlayerPadding();
  const kind = liveKindOf(tab);

  const loadPage = useCallback(
    async (page: number) => {
      if (kind === null) {
        return { items: [], total: 0 };
      }
      const serverSort =
        kind === 'timers' || kind === 'seriesTimers'
          ? undefined
          : { sortBy: sort.sortBy, sortOrder: sort.sortOrder };
      const result = await loadLiveTvPage(kind, page, serverSort);
      if (kind === 'timers' || kind === 'seriesTimers') {
        return { ...result, items: sortTimers(result.items, sort) };
      }
      return result;
    },
    // 原始值依赖，避免 LibraryScreen 每渲染新建 sort 对象导致分页循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, sort.sortBy, sort.sortOrder]
  );
  const state = usePagedLoad<MediaLibraryItem>(loadPage);

  const handlePlay = useCallback(
    async (item: MediaLibraryItem) => {
      const targetId = item.type === 'Program' ? (item.channelId ?? item.id) : item.id;
      try {
        const session = await playbackService.resolve(targetId);
        navigation.navigate(ROUTES.PLAYER, { session });
      } catch {
        showToast('该服务器暂不支持此直播播放', 'error');
      }
    },
    [navigation]
  );

  if (kind === null) {
    return <EmptyView title="直播分类待接入" />;
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
    return <EmptyView title={emptyTitleOf(kind)} />;
  }

  const playable = kind !== 'timers' && kind !== 'seriesTimers';

  return (
    <FlashList
      data={state.itemList}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: MediaLibraryItem }) => {
        const subtext = subtextOf(item, kind);
        return (
          <Pressable
            style={styles.row}
            onPress={playable ? () => void handlePlay(item) : undefined}
            disabled={!playable}
          >
            {item.posterImageUrl !== undefined ? (
              <Image
                source={{ uri: item.posterImageUrl }}
                style={styles.thumb}
                contentFit="cover"
                transition={150}
                recyclingKey={item.id}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <AppIcon name="tv" size={20} color={t.textSecondary} />
              </View>
            )}
            <View style={styles.textWrap}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {subtext !== undefined && (
                <Text style={styles.subtext} numberOfLines={1}>
                  {subtext}
                </Text>
              )}
            </View>
          </Pressable>
        );
      }}
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
      minHeight: 64,
    },
    thumb: { width: 56, height: 40, borderRadius: 6, backgroundColor: t.bg },
    thumbFallback: { alignItems: 'center', justifyContent: 'center' },
    textWrap: { flex: 1, gap: 2 },
    name: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    subtext: { color: t.textSecondary, fontSize: FONT_SIZE.body - 1 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.separator },
    footer: { paddingVertical: SPACING.l },
  });
