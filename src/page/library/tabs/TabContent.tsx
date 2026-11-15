/**
 * Tab 渲染分发：按 TabSpec.renderer 选择具体渲染器；未知/未接入渲染器显示空态，
 * 保证任何配置组合都不会白屏。
 */
import type { MediaLibrary } from '@/adapter/model';
import { EmptyView } from '@/component/EmptyView';
import type { TabSpec } from '@/constant/libraryTabs';
import { useT } from '@/i18n';
import type { LibrarySortState } from '@/store/libraryViewStore';
import { AlbumGridTab } from '@/page/library/tabs/AlbumGridTab';
import { ArtistListTab } from '@/page/library/tabs/ArtistListTab';
import { EntityListTab } from '@/page/library/tabs/EntityListTab';
import { FolderTab } from '@/page/library/tabs/FolderTab';
import { LiveListTab } from '@/page/library/tabs/LiveListTab';
import { PhotoAlbumGridTab } from '@/page/library/tabs/PhotoAlbumGridTab';
import { PhotoGridTab } from '@/page/library/tabs/PhotoGridTab';
import { PlaylistGridTab } from '@/page/library/tabs/PlaylistGridTab';
import { PosterWallTab } from '@/page/library/tabs/PosterWallTab';
import { SongListTab } from '@/page/library/tabs/SongListTab';
import { SuggestionTab } from '@/page/library/tabs/SuggestionTab';
import { VideoGridTab } from '@/page/library/tabs/VideoGridTab';

interface TabContentProps {
  tab: TabSpec;
  library: MediaLibrary;
  sort: LibrarySortState;
  onClearFilter?: () => void;
}

export function TabContent({ tab, library, sort, onClearFilter }: TabContentProps) {
  const tr = useT();
  switch (tab.renderer) {
    case 'posterWall':
      if (tab.special === 'suggestions') {
        return <SuggestionTab tab={tab} libraryId={library.id} />;
      }
      if (tab.source === 'special') {
        return <EmptyView title={tr('library.unsupportedCategory')} />;
      }
      return (
        <PosterWallTab
          tab={tab}
          libraryId={library.id}
          sort={sort}
          onClearFilter={onClearFilter}
        />
      );
    case 'videoGrid':
      return <VideoGridTab libraryId={library.id} sort={sort} filters={tab.filters} />;
    case 'photoGrid':
      return <PhotoGridTab libraryId={library.id} sort={sort} />;
    case 'photoAlbumGrid':
      return <PhotoAlbumGridTab libraryId={library.id} sort={sort} />;
    case 'folderBrowser':
      return <FolderTab tab={tab} library={library} sort={sort} />;
    case 'songList':
      return <SongListTab libraryId={library.id} sort={sort} filters={tab.filters} />;
    case 'artistList':
      return (
        <ArtistListTab
          libraryId={library.id}
          sort={sort}
          emptyTitle={library.type === 'BOOK' ? tr('library.emptyAuthors') : tr('library.emptyArtists')}
        />
      );
    case 'albumGrid':
      return <AlbumGridTab libraryId={library.id} sort={sort} />;
    case 'playlistGrid':
      // 全局歌单查询（不带 ParentId），无需 libraryId（音乐个人歌单 §5.6.5）
      return <PlaylistGridTab sort={sort} />;
    case 'entityList':
      return <EntityListTab tab={tab} libraryId={library.id} />;
    case 'channelList':
    case 'programList':
    case 'recordingList':
    case 'timerList':
      return <LiveListTab tab={tab} sort={sort} />;
    default:
      return <EmptyView title={tr('library.unsupportedCategory')} />;
  }
}
