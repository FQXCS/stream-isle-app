/**
 * 库页显示配置 store：Tab/排序启停、拖动排序、5/1 边界、persist 与 actions 保留。
 */
import { LIBRARY_DISPLAY_STORE_KEY } from '@/constant/storage';
import { mmkv } from '@/infra/storage';
import { useLibraryDisplayStore } from '@/store/libraryDisplayStore';

const MOVIE_SCOPE = 'EMBY:MOVIE';
const MOVIE_ALL_SORT_SCOPE = 'EMBY:MOVIE:all';

function resetStore(): void {
  useLibraryDisplayStore.setState({
    tabListByScope: {},
    sortListByTabScope: {},
    defaultTabByScope: {},
  });
}

describe('libraryDisplayStore（Tab 启停与拖动排序）', () => {
  beforeEach(() => {
    mmkv.clearAll();
    resetStore();
  });

  it('启用新 Tab 追加到末尾', () => {
    const { toggleTab } = useLibraryDisplayStore.getState().actions;
    toggleTab('EMBY', 'MOVIE', 'played');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual([
      'all',
      'favorite',
      'unplayed',
      'folder',
      'played',
    ]);
  });

  it('取消 Tab 从列表移除；只剩 1 个时取消被忽略', () => {
    const { toggleTab } = useLibraryDisplayStore.getState().actions;
    toggleTab('EMBY', 'MOVIE', 'favorite');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual([
      'all',
      'unplayed',
      'folder',
    ]);
    toggleTab('EMBY', 'MOVIE', 'all');
    toggleTab('EMBY', 'MOVIE', 'unplayed');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual(['folder']);
    toggleTab('EMBY', 'MOVIE', 'folder');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual(['folder']);
  });

  it('超过 5 个时新增被忽略', () => {
    const { toggleTab } = useLibraryDisplayStore.getState().actions;
    toggleTab('EMBY', 'MOVIE', 'played');
    toggleTab('EMBY', 'MOVIE', 'trailer');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual([
      'all',
      'favorite',
      'unplayed',
      'folder',
      'played',
    ]);
  });

  it('拖动排序覆盖数组顺序；缺项/多项时拒绝', () => {
    const { toggleTab, reorderTabs } = useLibraryDisplayStore.getState().actions;
    toggleTab('EMBY', 'MOVIE', 'played');
    reorderTabs('EMBY', 'MOVIE', ['folder', 'played', 'unplayed', 'favorite', 'all']);
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual([
      'folder',
      'played',
      'unplayed',
      'favorite',
      'all',
    ]);
    // 缺一项：拒绝覆盖
    reorderTabs('EMBY', 'MOVIE', ['folder', 'played']);
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toEqual([
      'folder',
      'played',
      'unplayed',
      'favorite',
      'all',
    ]);
  });

  it('Jellyfin 不存在的 Tab 不能启用；resetTabs 清覆盖', () => {
    const { toggleTab, resetTabs } = useLibraryDisplayStore.getState().actions;
    toggleTab('JELLYFIN', 'MUSIC', 'played');
    expect(useLibraryDisplayStore.getState().tabListByScope['JELLYFIN:MUSIC']).toBeUndefined();
    toggleTab('EMBY', 'MOVIE', 'played');
    resetTabs('EMBY', 'MOVIE');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toBeUndefined();
  });

  it('默认显示只接受已启用 Tab；关闭默认 Tab 时清除设置', () => {
    const { setDefaultTab, toggleTab } = useLibraryDisplayStore.getState().actions;
    setDefaultTab('EMBY', 'MOVIE', 'trailer');
    expect(useLibraryDisplayStore.getState().defaultTabByScope[MOVIE_SCOPE]).toBeUndefined();
    setDefaultTab('EMBY', 'MOVIE', 'favorite');
    expect(useLibraryDisplayStore.getState().defaultTabByScope[MOVIE_SCOPE]).toBe('favorite');
    toggleTab('EMBY', 'MOVIE', 'favorite');
    expect(useLibraryDisplayStore.getState().defaultTabByScope[MOVIE_SCOPE]).toBeUndefined();
  });

  it('resetTabs 同时清除默认显示', () => {
    const { setDefaultTab, resetTabs } = useLibraryDisplayStore.getState().actions;
    setDefaultTab('EMBY', 'MOVIE', 'folder');
    resetTabs('EMBY', 'MOVIE');
    expect(useLibraryDisplayStore.getState().defaultTabByScope[MOVIE_SCOPE]).toBeUndefined();
  });
});

describe('libraryDisplayStore（排序启停与拖动排序）', () => {
  beforeEach(() => {
    mmkv.clearAll();
    resetStore();
  });

  it('启用新排序项追加到末尾，再次点击移除', () => {
    const { toggleSort } = useLibraryDisplayStore.getState().actions;
    toggleSort('EMBY', 'MOVIE', 'all', 'DIRECTOR');
    const appended = useLibraryDisplayStore.getState().sortListByTabScope[MOVIE_ALL_SORT_SCOPE];
    expect(appended).toBeDefined();
    expect(appended?.[appended.length - 1]).toBe('DIRECTOR');
    toggleSort('EMBY', 'MOVIE', 'all', 'DIRECTOR');
    expect(
      useLibraryDisplayStore.getState().sortListByTabScope[MOVIE_ALL_SORT_SCOPE]
    ).not.toContain('DIRECTOR');
  });

  it('Jellyfin 不支持的排序项不能启用', () => {
    const { toggleSort } = useLibraryDisplayStore.getState().actions;
    toggleSort('JELLYFIN', 'MOVIE', 'all', 'FILENAME');
    expect(useLibraryDisplayStore.getState().sortListByTabScope['JELLYFIN:MOVIE:all']).toBeUndefined();
  });

  it('至少保留 1 项：取消最后一项被忽略', () => {
    useLibraryDisplayStore.setState({
      sortListByTabScope: { [MOVIE_ALL_SORT_SCOPE]: ['RANDOM'] },
    });
    const { toggleSort } = useLibraryDisplayStore.getState().actions;
    toggleSort('EMBY', 'MOVIE', 'all', 'RANDOM');
    expect(useLibraryDisplayStore.getState().sortListByTabScope[MOVIE_ALL_SORT_SCOPE]).toEqual([
      'RANDOM',
    ]);
  });

  it('拖动排序覆盖排序项顺序；缺项时拒绝', () => {
    useLibraryDisplayStore.setState({
      sortListByTabScope: { [MOVIE_ALL_SORT_SCOPE]: ['RANDOM', 'SORT_NAME', 'DATE_CREATED'] },
    });
    const { reorderSorts } = useLibraryDisplayStore.getState().actions;
    reorderSorts('EMBY', 'MOVIE', 'all', ['DATE_CREATED', 'SORT_NAME', 'RANDOM']);
    expect(useLibraryDisplayStore.getState().sortListByTabScope[MOVIE_ALL_SORT_SCOPE]).toEqual([
      'DATE_CREATED',
      'SORT_NAME',
      'RANDOM',
    ]);
    reorderSorts('EMBY', 'MOVIE', 'all', ['DATE_CREATED', 'SORT_NAME']);
    expect(useLibraryDisplayStore.getState().sortListByTabScope[MOVIE_ALL_SORT_SCOPE]).toEqual([
      'DATE_CREATED',
      'SORT_NAME',
      'RANDOM',
    ]);
  });

  it('resetSorts 清覆盖；resetAll 只清指定 flavor', () => {
    const { toggleTab, toggleSort, setDefaultTab, resetSorts, resetAll } =
      useLibraryDisplayStore.getState().actions;
    toggleTab('EMBY', 'MOVIE', 'played');
    toggleTab('JELLYFIN', 'MOVIE', 'played');
    toggleSort('EMBY', 'MOVIE', 'all', 'DIRECTOR');
    toggleSort('JELLYFIN', 'MOVIE', 'all', 'RANDOM');
    setDefaultTab('EMBY', 'MOVIE', 'favorite');
    setDefaultTab('JELLYFIN', 'MOVIE', 'favorite');
    resetSorts('EMBY', 'MOVIE', 'all');
    expect(useLibraryDisplayStore.getState().sortListByTabScope[MOVIE_ALL_SORT_SCOPE]).toBeUndefined();
    expect(
      useLibraryDisplayStore.getState().sortListByTabScope['JELLYFIN:MOVIE:all']
    ).toBeDefined();
    resetAll('EMBY');
    expect(useLibraryDisplayStore.getState().tabListByScope[MOVIE_SCOPE]).toBeUndefined();
    expect(useLibraryDisplayStore.getState().tabListByScope['JELLYFIN:MOVIE']).toBeDefined();
    expect(useLibraryDisplayStore.getState().defaultTabByScope[MOVIE_SCOPE]).toBeUndefined();
    expect(useLibraryDisplayStore.getState().defaultTabByScope['JELLYFIN:MOVIE']).toBe(
      'favorite'
    );
  });
});

describe('libraryDisplayStore persist', () => {
  beforeEach(() => {
    mmkv.clearAll();
    resetStore();
  });

  it('持久化配置映射，不落 actions', () => {
    const { toggleTab, setDefaultTab } = useLibraryDisplayStore.getState().actions;
    toggleTab('EMBY', 'MOVIE', 'played');
    setDefaultTab('EMBY', 'MOVIE', 'played');
    const snapshot = mmkv.getString(LIBRARY_DISPLAY_STORE_KEY) ?? '';
    expect(snapshot).toContain('"tabListByScope"');
    expect(snapshot).toContain('"defaultTabByScope"');
    expect(snapshot).toContain('"played"');
    expect(snapshot).not.toContain('"actions"');
  });

  it('旧快照含 actions:{} 回灌仍保留 action', async () => {
    mmkv.set(
      LIBRARY_DISPLAY_STORE_KEY,
      JSON.stringify({
        state: {
          tabListByScope: { 'EMBY:MOVIE': ['folder', 'all'] },
          sortListByTabScope: {},
          actions: {},
        },
        version: 0,
      })
    );
    await useLibraryDisplayStore.persist.rehydrate();
    expect(useLibraryDisplayStore.getState().tabListByScope['EMBY:MOVIE']).toEqual([
      'folder',
      'all',
    ]);
    expect(typeof useLibraryDisplayStore.getState().actions.toggleTab).toBe('function');
    expect(typeof useLibraryDisplayStore.getState().actions.reorderSorts).toBe('function');
  });
});
