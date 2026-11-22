/**
 * 库页/目录浏览的条目判定（M7）：
 * 空文件夹不展示——Emby/Jellyfin 的 Items?Recursive=false 会返回空目录（如 __pycache__），
 * 服务器没有「隐藏空文件夹」参数，统一在客户端过滤。
 * childCount 缺失时保留：服务器未返回数量时无法判定为空，宁可展示。
 */
import type { MediaLibraryItem } from '@/adapter/model';

/** 是否为空文件夹（Folder 且 ChildCount=0，目录浏览时隐藏） */
export function isEmptyFolder(item: MediaLibraryItem): boolean {
  return item.type === 'Folder' && item.childCount === 0;
}

/** 目录浏览可见条目：剔除空文件夹 */
export function visibleFolderItems(itemList: readonly MediaLibraryItem[]): MediaLibraryItem[] {
  return itemList.filter((item) => !isEmptyFolder(item));
}
