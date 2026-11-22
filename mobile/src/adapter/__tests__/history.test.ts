/**
 * adapter 观看历史单测（M6 文档 §6.1 BaseAdapter.history 行）：
 * query 参数全量断言（Filters=IsPlayed、SortBy=DatePlayed、SortOrder=Descending、
 * StartIndex/Limit、IncludeItemTypes 由设置页多选传入）；LastPlayedDate → lastPlayedAtMs 换算。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok-1' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('BaseAdapter 观看历史（M6 §6.1 history 行）', () => {
  it('query 参数全量断言（M6 §4.3.1 端点映射表）', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN', { Items: [], TotalRecordCount: 0 });
    await adapter.getWatchHistory('u1', {
      startIndex: 40,
      limit: 40,
      includeItemTypes: ['Movie', 'Episode', 'Video'],
    });
    const url = api.request.mock.calls[0][0].url as string;
    expect(url.startsWith('http://srv/Users/u1/Items?')).toBe(true);
    const query = url.split('?')[1];
    const params = new URLSearchParams(query);
    expect(params.get('IncludeItemTypes')).toBe('Movie,Episode,Video');
    expect(params.get('Filters')).toBe('IsPlayed');
    expect(params.get('SortBy')).toBe('DatePlayed');
    expect(params.get('SortOrder')).toBe('Descending');
    expect(params.get('Recursive')).toBe('true');
    expect(params.get('StartIndex')).toBe('40');
    expect(params.get('Limit')).toBe('40');
    expect(params.get('Fields')).toBe('PrimaryImageAspectRatio');
  });

  it('翻译：LastPlayedDate → lastPlayedAtMs、集行携带 SeriesName/季号/集号', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        {
          Id: 'm1',
          Type: 'Movie',
          Name: '电影甲',
          ProductionYear: 2024,
          RunTimeTicks: 120 * 60 * 10_000_000,
          ImageTags: { Primary: 'tag-1' },
          UserData: { Played: true, PlayCount: 1, IsFavorite: false, LastPlayedDate: '2026-10-30T08:30:00.000Z' },
        },
        {
          Id: 'e1',
          Type: 'Episode',
          Name: '第一集',
          SeriesId: 's1',
          SeriesName: '剧乙',
          ParentIndexNumber: 1,
          IndexNumber: 1,
          UserData: { Played: true, PlayCount: 2 },
        },
      ],
      TotalRecordCount: 2,
      StartIndex: 0,
    });
    const page = await adapter.getWatchHistory('u1', {
      startIndex: 0,
      limit: 40,
      includeItemTypes: ['Movie', 'Episode', 'Video'],
    });
    expect(page.total).toBe(2);
    expect(page.items[0].lastPlayedAtMs).toBe(Date.parse('2026-10-30T08:30:00.000Z'));
    expect(page.items[1].seriesName).toBe('剧乙');
    expect(page.items[1].parentIndexNumber).toBe(1);
    expect(page.items[1].indexNumber).toBe(1);
    // LastPlayedDate 缺失 → 字段不产出（不编造）
    expect(page.items[1].lastPlayedAtMs).toBeUndefined();
  });
});
