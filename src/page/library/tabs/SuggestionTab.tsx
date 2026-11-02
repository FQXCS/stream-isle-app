/**
 * 推荐 Tab：Suggestions 端点（失败回退最新添加），复用通用视频网格。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MediaLibraryItem } from '@/adapter/model';
import type { TabSpec } from '@/constant/libraryTabs';
import { PAGE_SIZE } from '@/constant/browse';
import { PhotoVideoGrid } from '@/page/photo/PhotoVideoGrid';
import { navigateTabItem } from '@/page/library/tabs/navigation';
import type { RootStackParamList } from '@/page/navigation/types';
import { loadSuggestions } from '@/service/LibraryBrowseService';

type SuggestNavigation = NativeStackNavigationProp<RootStackParamList>;

interface SuggestionTabProps {
  tab: TabSpec;
  libraryId: string;
}

export function SuggestionTab({ tab, libraryId }: SuggestionTabProps) {
  const navigation = useNavigation<SuggestNavigation>();
  const loadPage = useCallback(
    async (page: number) => {
      if (page > 0) {
        return { items: [], total: 0 };
      }
      const items = await loadSuggestions(libraryId, tab.kinds ?? [], PAGE_SIZE);
      return { items, total: items.length };
    },
    [libraryId, tab.kinds]
  );
  return (
    <PhotoVideoGrid
      loadPage={loadPage}
      onPressItem={(item: MediaLibraryItem) => navigateTabItem(navigation, tab.tap, item)}
      emptyTitle="暂无推荐"
    />
  );
}
