/**
 * TV 自持路由映射（TV-m2 §2.1）：手机版住在 @/page/library/tabs/navigation.ts（TV 禁入），
 * 本文件为 TV 等价函数——按 TabSpec.tap / 条目类型分发到 TV 路由子集。
 * m2 落地范围：item → 详情、collection → 通用列表、Folder → 文件夹下钻（逐级 push）、
 * BoxSet → 合集列表、Person → 人物页；album/artist/playlist 类 tap 不在 TV-m2
 * 渲染白名单（TV-m2-S1），对应 tap 不可能出现，防御性落详情。
 */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { LibraryTypeEnum, MediaLibraryItem, SortByEnum } from '@/adapter/model';
import type { TabTap } from '@/constant/libraryTabs';
import { ROUTES } from '@/constant/navigation';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

/** 文件夹下钻所需的库上下文（与手机 LIBRARY_FOLDER 参数对齐，TV-m2 §4.2） */
export interface TvFolderTargetContext {
  libraryId: string;
  libraryType: LibraryTypeEnum;
  /** 目录墙缓存分区键（沿用所在 Tab 的 id） */
  tabId: string;
  sortBy: SortByEnum;
  sortOrder: 'ASC' | 'DESC';
}

/** 库页 Tab 条目点击落地（TV 子集：海报墙白名单内 tap 仅 item/collection） */
export function tvNavigateTabItem(
  navigation: TvNavigation,
  tap: TabTap,
  item: MediaLibraryItem
): void {
  switch (tap) {
    case 'collection':
      navigation.navigate(ROUTES.ITEM_LIST, { title: item.name, parentId: item.id });
      return;
    case 'item':
    default:
      // 白名单外 tap（album/artist/playlist 等）由渲染白名单挡住，防御性落详情
      navigation.navigate(ROUTES.ITEM, { itemId: item.id });
  }
}

/**
 * 文件夹内容/通用列表：按条目类型选择详情、合集列表、人物页或文件夹下钻。
 * folderContext 缺省时 Folder 条目落详情（防御；正常调用方均在库/文件夹屏内持有上下文）。
 */
export function tvNavigateMediaItem(
  navigation: TvNavigation,
  item: MediaLibraryItem,
  folderContext?: TvFolderTargetContext
): void {
  if (item.type === 'Folder' && folderContext !== undefined) {
    navigation.navigate(ROUTES.LIBRARY_FOLDER, {
      libraryId: folderContext.libraryId,
      libraryType: folderContext.libraryType,
      folderId: item.id,
      folderName: item.name,
      tabId: folderContext.tabId,
      sortBy: folderContext.sortBy,
      sortOrder: folderContext.sortOrder,
      kind: 'folder',
    });
    return;
  }
  if (item.type === 'BoxSet') {
    navigation.navigate(ROUTES.ITEM_LIST, { title: item.name, parentId: item.id });
    return;
  }
  if (item.type === 'Person') {
    navigation.navigate(ROUTES.PERSON, { personId: item.id });
    return;
  }
  navigation.navigate(ROUTES.ITEM, { itemId: item.id });
}
