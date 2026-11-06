/**
 * 海报墙缓存键：新增 tabId / GenreIds / TagFilters / StudioIds 维度后互不串缓存。
 * 追加翻页回归：累计条目数不能叠加本页 startIndex，否则第 2 页起就提前 DONE（长目录尾部条目永远不加载）。
 */
import type { ItemQuery, MediaLibraryItem } from '@/adapter/model';
import { fetchWallPage } from '@/service/BrowseService';
import {
  normalizeIdList,
  normalizeTagFilters,
  useBrowseStore,
  wallKeyOf,
} from '@/store/browseStore';

jest.mock('@/service/BrowseService', () => ({
  fetchLibraries: jest.fn(),
  fetchWallPage: jest.fn(),
}));

function itemOf(index: number): MediaLibraryItem {
  return {
    id: `item-${index}`,
    type: 'Movie',
    name: `条目 ${index}`,
    userData: { played: false, playCount: 0, favorite: false, playbackPositionMs: 0 },
  };
}

function queryOf(startIndex: number): ItemQuery {
  return { userId: 'u1', parentId: 'lib1', recursive: false, startIndex, limit: 40 };
}

function pageOf(startIndex: number, count: number, total: number) {
  return {
    items: Array.from({ length: count }, (_, i) => itemOf(startIndex + i)),
    total,
    startIndex,
  };
}

const BASE_QUERY: Pick<ItemQuery, 'kinds' | 'sortBy' | 'sortOrder' | 'filters'> = {
  kinds: ['Movie'],
  sortBy: 'SORT_NAME',
  sortOrder: 'ASC',
  filters: ['IsUnplayed'],
};

describe('wallKeyOf 扩展维度', () => {
  it('tabId 参与缓存键', () => {
    const keyA = wallKeyOf('s1', 'u1', 'lib1', BASE_QUERY, 'all');
    const keyB = wallKeyOf('s1', 'u1', 'lib1', BASE_QUERY, 'unplayed');
    expect(keyA).not.toBe(keyB);
  });

  it('GenreIds/StudioIds 顺序无关；TagFilters 按 id 保序去重', () => {
    const queryA = {
      ...BASE_QUERY,
      genreIds: ['g2', 'g1'],
      studioIds: ['s2', 's1'],
      tagFilters: [
        { id: 't2', name: 'Drama' },
        { id: 't1', name: 'Action' },
        { id: 't2', name: 'Drama' },
      ],
    };
    const queryB = {
      ...BASE_QUERY,
      genreIds: ['g1', 'g2'],
      studioIds: ['s1', 's2'],
      tagFilters: [
        { id: 't1', name: 'Action' },
        { id: 't2', name: 'Drama' },
      ],
    };
    expect(wallKeyOf('s1', 'u1', 'lib1', queryA, 'all')).toBe(
      wallKeyOf('s1', 'u1', 'lib1', queryB, 'all')
    );
  });

  it('规范化函数输出稳定', () => {
    expect(normalizeIdList(['b', 'a', 'b'])).toBe('a,b');
    expect(normalizeTagFilters([{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }])).toBe('a=A,b=B');
  });
});

describe('loadWallPage 分页状态', () => {
  const key = 'wall:test';
  const fetchWallPageMock = jest.mocked(fetchWallPage);

  beforeEach(() => {
    useBrowseStore.setState({ librariesByKey: {}, walls: {} });
    fetchWallPageMock.mockReset();
  });

  it('追加页按累计条目数判定，不提前 DONE（100 条共 3 页）', async () => {
    fetchWallPageMock
      .mockResolvedValueOnce(pageOf(0, 40, 100))
      .mockResolvedValueOnce(pageOf(40, 40, 100))
      .mockResolvedValueOnce(pageOf(80, 20, 100));
    const actions = useBrowseStore.getState().actions;

    await actions.loadWallPage(key, queryOf(0), true);
    expect(useBrowseStore.getState().walls[key].status).toBe('READY');

    await actions.loadWallPage(key, queryOf(40), false);
    // 旧实现按 startIndex + 累计数（40 + 80）判定，此处会误判 DONE 丢掉尾部条目
    expect(useBrowseStore.getState().walls[key].items).toHaveLength(80);
    expect(useBrowseStore.getState().walls[key].status).toBe('READY');

    await actions.loadWallPage(key, queryOf(80), false);
    expect(useBrowseStore.getState().walls[key].items).toHaveLength(100);
    expect(useBrowseStore.getState().walls[key].status).toBe('DONE');
  });

  it('整页即到底时直接 DONE（总量不超过单页）', async () => {
    fetchWallPageMock.mockResolvedValueOnce(pageOf(0, 12, 12));
    await useBrowseStore.getState().actions.loadWallPage(key, queryOf(0), true);
    expect(useBrowseStore.getState().walls[key].status).toBe('DONE');
  });
});
