/**
 * 库页排序记忆键：Tab 级新键写入，旧库级键缺省回退（升级不丢上次排序）。
 */
import {
  librarySortKeyOf,
  libraryTabSortKeyOf,
  savedLibrarySortOf,
  type LibrarySortState,
} from '@/store/libraryViewStore';

const OLD_STATE: LibrarySortState = { sortBy: 'DATE_CREATED', sortOrder: 'DESC' };
const NEW_STATE: LibrarySortState = { sortBy: 'RANDOM', sortOrder: 'ASC' };

describe('libraryViewStore 排序键', () => {
  it('键格式：serverId:libraryId[:tabId]', () => {
    expect(librarySortKeyOf('s1', 'lib1')).toBe('s1:lib1');
    expect(libraryTabSortKeyOf('s1', 'lib1', 'all')).toBe('s1:lib1:all');
  });

  it('优先读取 Tab 级新键', () => {
    const sortByKey = {
      's1:lib1': OLD_STATE,
      's1:lib1:all': NEW_STATE,
    };
    expect(savedLibrarySortOf(sortByKey, 's1', 'lib1', 'all')).toEqual(NEW_STATE);
  });

  it('新键缺失时回退旧的库级键', () => {
    const sortByKey = { 's1:lib1': OLD_STATE };
    expect(savedLibrarySortOf(sortByKey, 's1', 'lib1', 'favorite')).toEqual(OLD_STATE);
  });

  it('都没有时返回 undefined', () => {
    expect(savedLibrarySortOf({}, 's1', 'lib1', 'all')).toBeUndefined();
  });
});
