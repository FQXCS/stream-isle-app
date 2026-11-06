/**
 * 通用条目列表（合集子项 / 类型、标签、工作室过滤 / 游戏系统 / 插件频道节目）：
 * 统一走 listItems 分页海报墙，点击按条目类型落地。
 */
import { useCallback } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ItemQuery } from '@/adapter/model';
import { PAGE_SIZE } from '@/constant/browse';
import { useT } from '@/i18n';
import type { ItemListParams, RootStackParamList } from '@/page/navigation/types';
import { navigateMediaItem } from '@/page/library/tabs/navigation';
import { PhotoVideoGrid } from '@/page/photo/PhotoVideoGrid';
import { fetchWallPage } from '@/service/BrowseService';
import { useAccountStore } from '@/store/accountStore';

type ItemListNavigation = NativeStackNavigationProp<RootStackParamList>;

export function ItemListScreen() {
  const route = useRoute<{ key: string; name: string; params: ItemListParams }>();
  const navigation = useNavigation<ItemListNavigation>();
  const tr = useT();
  const userId = useAccountStore((state) => state.active?.userId ?? '');
  const {
    title,
    parentId,
    kinds,
    filters,
    genreIds,
    tagFilters,
    studioIds,
    channelId,
  } = route.params;

  const loadPage = useCallback(
    (page: number) =>
      fetchWallPage({
        userId,
        parentId,
        kinds,
        filters,
        genreIds,
        tagFilters,
        studioIds,
        channelId,
        sortBy: 'SORT_NAME',
        sortOrder: 'ASC',
        startIndex: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      } satisfies ItemQuery),
    [userId, parentId, kinds, filters, genreIds, tagFilters, studioIds, channelId]
  );

  return (
    <PhotoVideoGrid
      loadPage={loadPage}
      onPressItem={(item) => navigateMediaItem(navigation, item)}
      emptyTitle={tr('itemList.empty', { title })}
    />
  );
}
