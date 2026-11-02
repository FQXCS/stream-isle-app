/**
 * 海报墙缓存键：新增 tabId / GenreIds / TagFilters / StudioIds 维度后互不串缓存。
 */
import type { ItemQuery } from '@/adapter/model';
import {
  normalizeIdList,
  normalizeTagFilters,
  wallKeyOf,
} from '@/store/browseStore';

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
