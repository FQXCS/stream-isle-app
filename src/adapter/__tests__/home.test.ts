/**
 * adapter 首页三区具名封装单测（M4 文档 §3/§6.1）：getResume/getNextUp/getLatest 的
 * 端点与参数构造；getNextUp 翻译为 EpisodeItem（含 seriesId，供自动连播匹配，M4 §4.4）。
 */
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import { HOME_ROW_LIMIT, LIBRARY_ROW_LIMIT } from '@/constant/browse';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(responses: unknown[]): { adapter: JellyfinAdapter; api: { request: jest.Mock } } {
  let call = 0;
  const api = {
    request: jest.fn(() => Promise.resolve(responses[Math.min(call++, responses.length - 1)])),
  };
  const adapter = new JellyfinAdapter(
    { baseUrl: 'http://srv', flavor: 'JELLYFIN', token: 'tok' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('adapter 首页三区（M4 §3 认领补齐）', () => {
  it('getResume：Filters=IsResumable + 设置页类型 + DatePlayed 降序 + Limit', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getResume('u1', ['Movie', 'Episode', 'Video']);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain('/Users/u1/Items?');
    expect(req.url).toContain('Filters=IsResumable');
    expect(req.url).toContain('IncludeItemTypes=Movie%2CEpisode%2CVideo');
    expect(req.url).toContain('SortBy=DatePlayed');
    expect(req.url).toContain('SortOrder=Descending');
    expect(req.url).toContain(`Limit=${HOME_ROW_LIMIT}`);
  });

  it('getLatest：MinDateLastSavedForUser 限定最近 7 天 + DateCreated 降序 + Movie,Series（parentId 透传）', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-06T12:00:00Z'));
    try {
      const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
      await adapter.getLatest('u1', 'lib1');
      const req = api.request.mock.calls[0][0];
      const url = new URL(req.url as string);
      expect(url.pathname).toBe('/Users/u1/Items');
      expect(url.searchParams.get('ParentId')).toBe('lib1');
      expect(url.searchParams.get('IncludeItemTypes')).toBe('Movie,Series');
      expect(url.searchParams.get('SortBy')).toBe('DateCreated');
      expect(url.searchParams.get('SortOrder')).toBe('Descending');
      expect(url.searchParams.get('Limit')).toBe(String(HOME_ROW_LIMIT));
      // 时间窗 = 当前时间 - 7 天（排序字段保持 DateCreated，不受时间窗影响）
      expect(url.searchParams.get('MinDateLastSavedForUser')).toBe('2026-10-30T12:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('getLatest：limit 透传（媒体库融合页每库行 20 条）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatest('u1', 'lib1', LIBRARY_ROW_LIMIT);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain(`Limit=${LIBRARY_ROW_LIMIT}`);
  });

  it('getLatestByTypes：按库类型取条目类型（剧集库取单集，16:9 剧照口径；不设时间窗）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatestByTypes('u1', 'lib2', 'Episode', LIBRARY_ROW_LIMIT);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain('/Users/u1/Items?');
    expect(req.url).toContain('ParentId=lib2');
    expect(req.url).toContain('IncludeItemTypes=Episode');
    expect(req.url).toContain('SortBy=DateCreated');
    expect(req.url).toContain(`Limit=${LIBRARY_ROW_LIMIT}`);
    expect(req.url).not.toContain('MinDateLastSavedForUser');
  });

  it('getLatestByTypes：Filters 透传（默认 Tab 带收藏/未看筛选时）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatestByTypes('u1', 'lib1', 'Movie', LIBRARY_ROW_LIMIT, ['IsFavorite']);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain('Filters=IsFavorite');
    expect(req.url).toContain(`Limit=${LIBRARY_ROW_LIMIT}`);
  });

  it('getNextUp：GET /Shows/NextUp，翻译含 seriesId（自动连播匹配依赖，M4 §4.4）', async () => {
    const { adapter, api } = makeAdapter([
      {
        Items: [
          {
            Id: 'ep9',
            Type: 'Episode',
            Name: '第九集',
            SeriesId: 'seriesA',
            SeasonId: 'season1',
            IndexNumber: 9,
          },
        ],
        TotalRecordCount: 1,
      },
    ]);
    const list = await adapter.getNextUp('u1');
    const req = api.request.mock.calls[0][0];
    expect(req.url).toMatch(/^http:\/\/srv\/Shows\/NextUp\?/);
    expect(req.url).toContain('UserId=u1');
    expect(req.url).toContain(`Limit=${HOME_ROW_LIMIT}`);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'ep9',
      type: 'Episode',
      name: '第九集',
      seriesId: 'seriesA',
      seasonId: 'season1',
      indexNumber: 9,
    });
  });
});
