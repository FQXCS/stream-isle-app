/**
 * 媒体管理纯函数：库列表重排与显隐覆盖套用。
 * 管理页 / 服务层 / 融合页 / 全部库列表共用，保证口径不漂移。
 */
import type { MediaLibrary } from '@/adapter/model';
import type { LibraryManageOverride } from '@/store/libraryManageStore';

/** 按 orderedIdList 重排：声明者按声明顺序在前，未声明者保持原序垫底（稳定排序） */
export function orderLibraries(
  libraryList: readonly MediaLibrary[],
  orderedIdList: readonly string[]
): MediaLibrary[] {
  const rankById = new Map(orderedIdList.map((id, index) => [id, index]));
  return [...libraryList].sort(
    (a, b) =>
      (rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

/** 套用本地覆盖：无覆盖原样返回；有覆盖滤隐藏 + 重排（服务器不支持显隐时本机兜底） */
export function applyManageOverride(
  libraryList: readonly MediaLibrary[],
  override?: LibraryManageOverride
): MediaLibrary[] {
  if (override === undefined) {
    return [...libraryList];
  }
  const hiddenIdSet = new Set(override.hiddenIdList);
  return orderLibraries(
    libraryList.filter((library) => !hiddenIdSet.has(library.id)),
    override.orderedIdList
  );
}