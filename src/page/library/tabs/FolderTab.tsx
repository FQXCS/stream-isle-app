/**
 * 文件夹 Tab：仅渲染库根目录；进入子文件夹/相册由 LibraryFolder 路由承接
 * （原生 push 滑动转场、标题改为目录名，并自然隐藏库页 Tab 栏）。
 */
import type { MediaLibrary } from '@/adapter/model';
import type { TabSpec } from '@/constant/libraryTabs';
import { LibraryFolderBrowser } from '@/page/library/components/LibraryFolderBrowser';
import type { LibrarySortState } from '@/store/libraryViewStore';

interface FolderTabProps {
  tab: TabSpec;
  library: MediaLibrary;
  sort: LibrarySortState;
}

export function FolderTab({ tab, library, sort }: FolderTabProps) {
  return (
    <LibraryFolderBrowser
      libraryId={library.id}
      libraryType={library.type}
      containerId={library.id}
      sort={sort}
      tabId={tab.id}
    />
  );
}
