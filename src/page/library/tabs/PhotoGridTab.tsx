/**
 * 照片网格 Tab：包 PhotoGridScreen（全屏查看器/分页/排序）。
 */
import type { LibrarySortState } from '@/store/libraryViewStore';
import { useT } from '@/i18n';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';

interface PhotoGridTabProps {
  libraryId: string;
  sort: LibrarySortState;
}

export function PhotoGridTab({ libraryId, sort }: PhotoGridTabProps) {
  const tr = useT();
  return <PhotoGridScreen parentId={libraryId} sort={sort} emptyTitle={tr('library.emptyPhotos')} />;
}
