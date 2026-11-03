/**
 * adapter 首页三区具名封装单测（04 文档 §3/§6.1）：getResume/getNextUp/getLatest 的
 * 端点与参数构造；getNextUp 翻译为 EpisodeItem（含 seriesId，供自动连播匹配，04 §4.4）。
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

describe('adapter 首页三区（04 §3 认领补齐）', () => {
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

  it('getLatest：SortBy=DateCreated 降序 + Movie,Series（parentId 透传）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatest('u1', 'lib1');
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain('/Users/u1/Items?');
    expect(req.url).toContain('ParentId=lib1');
    expect(req.url).toContain('IncludeItemTypes=Movie%2CSeries');
    expect(req.url).toContain('SortBy=DateCreated');
    expect(req.url).toContain('SortOrder=Descending');
    expect(req.url).toContain(`Limit=${HOME_ROW_LIMIT}`);
  });

  it('getLatest：limit 透传（媒体库融合页每库行 20 条）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatest('u1', 'lib1', LIBRARY_ROW_LIMIT);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain(`Limit=${LIBRARY_ROW_LIMIT}`);
  });

  it('getLatestByTypes：按库类型取条目类型（剧集库取单集，16:9 剧照口径）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatestByTypes('u1', 'lib2', 'Episode', LIBRARY_ROW_LIMIT);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain('/Users/u1/Items?');
    expect(req.url).toContain('ParentId=lib2');
    expect(req.url).toContain('IncludeItemTypes=Episode');
    expect(req.url).toContain('SortBy=DateCreated');
    expect(req.url).toContain(`Limit=${LIBRARY_ROW_LIMIT}`);
  });

  it('getLatestByTypes：Filters 透传（默认 Tab 带收藏/未看筛选时）', async () => {
    const { adapter, api } = makeAdapter([{ Items: [], TotalRecordCount: 0 }]);
    await adapter.getLatestByTypes('u1', 'lib1', 'Movie', LIBRARY_ROW_LIMIT, ['IsFavorite']);
    const req = api.request.mock.calls[0][0];
    expect(req.url).toContain('Filters=IsFavorite');
    expect(req.url).toContain(`Limit=${LIBRARY_ROW_LIMIT}`);
  });

  it('getNextUp：GET /Shows/NextUp，翻译含 seriesId（自动连播匹配依赖，04 §4.4）', async () => {
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
