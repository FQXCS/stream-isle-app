/**
 * BaseAdapter.browse 增量单测（M2 文档 §6.1 BaseAdapter.browse 行）：
 * Seasons/Episodes/Similar/PersonFilmography 路径与 query（SeasonId/Limit/PersonIds/
 * IncludeItemTypes）；getSeasons 按 indexNumber 升序且对服务器返回顺序不敏感。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown = { Items: [], TotalRecordCount: 0 }
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('getSeasons（季列表）', () => {
  it('双实例：GET /Shows/{seriesId}/Seasons + UserId/Fields 参数', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.getSeasons('u1', 'series1');
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('GET');
      expect(req.url).toBe(
        'http://srv/Shows/series1/Seasons?UserId=u1&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1'
      );
    }
  });

  it('结果按 indexNumber 升序、对服务器返回顺序不敏感；缺失/0 季号排最后', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        { Id: 's3', Type: 'Season', Name: '第三季', IndexNumber: 3 },
        { Id: 's0', Type: 'Season', Name: '特殊篇', IndexNumber: 0 },
        { Id: 's1', Type: 'Season', Name: '第一季', IndexNumber: 1 },
        { Id: 'sX', Type: 'Season', Name: '无季号' },
        { Id: 's2', Type: 'Season', Name: '第二季', IndexNumber: 2 },
      ],
    });
    const seasons = await adapter.getSeasons('u1', 'series1');
    expect(seasons.map((season) => season.id)).toEqual(['s1', 's2', 's3', 's0', 'sX']);
    expect(seasons[0].indexNumber).toBe(1);
  });
});

describe('getEpisodes（集列表）', () => {
  it('双实例：GET /Shows/{seriesId}/Episodes + UserId/SeasonId/Fields(Overview) 参数', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.getEpisodes('u1', 'series1', 'season1');
      const req = api.request.mock.calls[0][0];
      expect(req.url).toBe(
        'http://srv/Shows/series1/Episodes?UserId=u1&SeasonId=season1' +
          '&Fields=PrimaryImageAspectRatio%2COverview&ImageTypeLimit=1'
      );
    }
  });

  it('响应翻译：seasonId/seriesId/indexNumber/overview/进度与已看（UserData 默认返回）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Items: [
        {
          Id: 'e1',
          Type: 'Episode',
          Name: '第一集',
          IndexNumber: 1,
          SeasonId: 'season1',
          SeriesId: 'series1',
          Overview: '单行简介',
          RunTimeTicks: 2_640_000_0000,
          ImageTags: { Primary: 'epTag' },
          UserData: { Played: false, PlayCount: 0, PlaybackPositionTicks: 1_200_000_000 },
        },
        { Id: 'folder1', Type: 'Folder' }, // 词表外跳过
      ],
    });
    const episodes = await adapter.getEpisodes('u1', 'series1', 'season1');
    expect(episodes).toHaveLength(1);
    const episode = episodes[0];
    expect(episode.id).toBe('e1');
    expect(episode.seasonId).toBe('season1');
    expect(episode.seriesId).toBe('series1');
    expect(episode.indexNumber).toBe(1);
    expect(episode.overview).toBe('单行简介');
    expect(episode.runtimeMs).toBe(2_640_000);
    expect(episode.userData.playbackPositionMs).toBe(120_000);
    // 缩略图宽度 EPISODE_THUMB_MAX_WIDTH=400（复用列表 Primary 翻译）
    expect(episode.posterImageUrl).toContain('maxWidth=400');
  });
});

describe('getSimilar（相似推荐）', () => {
  it('双实例：GET /Items/{itemId}/Similar + UserId/Limit=12 参数', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor, {
        Items: [{ Id: 'sim1', Type: 'Movie', Name: '相似片' }],
      });
      const items = await adapter.getSimilar('u1', 'item1');
      expect(api.request.mock.calls[0][0].url).toBe(
        'http://srv/Items/item1/Similar?UserId=u1&Limit=12&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1'
      );
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('相似片');
    }
  });
});

describe('getPersonFilmography（人物出演作品）', () => {
  it('双实例：GET /Users/{uid}/Items + PersonIds/IncludeItemTypes/SortBy 参数', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor, {
        Items: [{ Id: 'f1', Type: 'Movie', Name: '出演电影' }],
      });
      const items = await adapter.getPersonFilmography('u1', 'person1');
      const url = api.request.mock.calls[0][0].url as string;
      expect(url.startsWith('http://srv/Users/u1/Items?')).toBe(true);
      expect(url).toContain('PersonIds=person1');
      expect(url).toContain('IncludeItemTypes=Movie%2CSeries');
      expect(url).toContain('Recursive=true');
      expect(url).toContain('SortBy=SortName');
      expect(url).toContain('SortOrder=Ascending');
      expect(items.map((item) => item.id)).toEqual(['f1']);
    }
  });
});
