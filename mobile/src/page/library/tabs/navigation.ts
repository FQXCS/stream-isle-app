/**
 * 库页 Tab 条目点击落地：按 TabSpec.tap 分发到详情/专辑/歌单/合集列表。
 * 文件夹内容用 navigateMediaItem（按条目类型回退）。
 */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MediaLibraryItem } from '@/adapter/model';
import type { TabTap } from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import type { RootStackParamList } from '@/page/navigation/types';

type LibraryNavigation = NativeStackNavigationProp<RootStackParamList>;

export function navigateTabItem(
  navigation: LibraryNavigation,
  tap: TabTap,
  item: MediaLibraryItem
): void {
  switch (tap) {
    case 'album':
      navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'album', itemId: item.id });
      return;
    case 'artist':
      navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'artist', itemId: item.id });
      return;
    case 'audioPlaylist':
      navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'playlist', itemId: item.id });
      return;
    case 'mediaPlaylist':
      navigation.navigate(ROUTES.PLAYLIST_DETAIL, { playlistId: item.id, title: item.name });
      return;
    case 'collection':
      navigation.navigate(ROUTES.ITEM_LIST, { title: item.name, parentId: item.id });
      return;
    case 'filteredList':
    case 'photoAlbum':
    case 'playChannel':
    case 'none':
      // 由对应专用渲染器处理（EntityListTab/PhotoAlbumGridTab/LiveListTab）
      return;
    case 'item':
    default:
      navigation.navigate(ROUTES.ITEM, { itemId: item.id });
  }
}

/** 文件夹内容/通用列表：按条目类型选择详情、专辑、歌单或合集子项 */
export function navigateMediaItem(
  navigation: LibraryNavigation,
  item: MediaLibraryItem
): void {
  if (item.type === 'MusicAlbum') {
    navigation.navigate(ROUTES.ALBUM_DETAIL, { kind: 'album', itemId: item.id });
    return;
  }
  if (item.type === 'Playlist') {
    navigation.navigate(ROUTES.PLAYLIST_DETAIL, { playlistId: item.id, title: item.name });
    return;
  }
  if (item.type === 'BoxSet') {
    navigation.navigate(ROUTES.ITEM_LIST, { title: item.name, parentId: item.id });
    return;
  }
  navigation.navigate(ROUTES.ITEM, { itemId: item.id });
}
