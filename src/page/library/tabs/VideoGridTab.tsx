/**
 * 视频网格 Tab：复用通用 PhotoVideoGrid（分页 + 长按菜单），点击进条目详情。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ItemFilterEnum } from '@/adapter/model';
import { ROUTES } from '@/constant/navigation';
import { useT } from '@/i18n';
import { PhotoVideoGrid } from '@/page/photo/PhotoVideoGrid';
import type { RootStackParamList } from '@/page/navigation/types';
import { fetchVideoPage } from '@/service/BrowseService';
import type { LibrarySortState } from '@/store/libraryViewStore';

type VideoNavigation = NativeStackNavigationProp<RootStackParamList>;

interface VideoGridTabProps {
  libraryId: string;
  sort: LibrarySortState;
  filters?: readonly ItemFilterEnum[];
}

export function VideoGridTab({ libraryId, sort, filters }: VideoGridTabProps) {
  const navigation = useNavigation<VideoNavigation>();
  const tr = useT();
  const loadPage = useCallback(
    (page: number) => fetchVideoPage(libraryId, page, sort, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libraryId, sort.sortBy, sort.sortOrder, filters]
  );
  return (
    <PhotoVideoGrid
      loadPage={loadPage}
      onPressItem={(item) => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
      emptyTitle={tr('library.emptyVideos')}
    />
  );
}
