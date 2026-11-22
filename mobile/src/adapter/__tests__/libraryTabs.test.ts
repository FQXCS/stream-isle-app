/**
 * 库页扩展 adapter：过滤参数映射、Suggestions/Genres/Tags/Studios/
 * LiveTV/PluginChannels/PlaylistEntries 的 URL 与翻译。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';
import type { ItemQuery } from '@/adapter/model';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown = { Items: [], TotalRecordCount: 0, StartIndex: 0 }
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

const BASE_QUERY: ItemQuery = { userId: 'u1', parentId: 'lib1', startIndex: 0, limit: 40 };

describe('listItems 过滤参数', () => {
  it('GenreIds / StudioIds 两端同名直传', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems({ ...BASE_QUERY, genreIds: ['g1', 'g2'], studioIds: ['s1'] });
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('GenreIds=g1%2Cg2');
    expect(url).toContain('StudioIds=s1');
  });

  it('标签：Emby 用 TagIds（id），Jellyfin 用 Tags（name）', async () => {
    const tagFilters = [
      { id: 't1', name: 'Action' },
      { id: 't2', name: 'Drama' },
    ];
    const emby = makeAdapter('EMBY');
    await emby.adapter.listItems({ ...BASE_QUERY, tagFilters });
    const embyUrl = emby.api.request.mock.calls[0][0].url as string;
    expect(embyUrl).toContain('TagIds=t1%2Ct2');
    expect(embyUrl).not.toContain('Tags=');

    const jellyfin = makeAdapter('JELLYFIN');
    await jellyfin.adapter.listItems({ ...BASE_QUERY, tagFilters });
    const jellyfinUrl = jellyfin.api.request.mock.calls[0][0].url as string;
    expect(jellyfinUrl).toContain('Tags=Action%2CDrama');
    expect(jellyfinUrl).not.toContain('TagIds=');
  });

  it('channelId 改走 /Channels/{id}/Items 并带 UserId', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems({ ...BASE_QUERY, channelId: 'ch1' });
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/Channels/ch1/Items?');
    expect(url).toContain('UserId=u1');
    expect(url).not.toContain('/Users/u1/Items');
  });
});

describe('getSuggestions', () => {
  it('GET /Users/{uid}/Suggestions + 翻译条目', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [{ Id: 'm1', Type: 'Movie', Name: '推荐电影' }],
      TotalRecordCount: 1,
    });
    const items = await adapter.getSuggestions('u1', 'lib1', ['Movie'], 20);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/Users/u1/Suggestions?');
    expect(url).toContain('ParentId=lib1');
    expect(url).toContain('IncludeItemTypes=Movie');
    expect(url).toContain('Limit=20');
    expect(items.map((item) => item.id)).toEqual(['m1']);
  });
});

describe('实体列表（Genres/Tags/Studios）', () => {
  it('按类型选择 Genres/MusicGenres/GameGenres 端点', async () => {
    const cases: [('Movie' | 'Audio' | 'Game')[], string][] = [
      [['Movie'], '/Genres?'],
      [['Audio'], '/MusicGenres?'],
      [['Game'], '/GameGenres?'],
    ];
    for (const [kinds, expectedPath] of cases) {
      const { adapter, api } = makeAdapter('EMBY', { Items: [], TotalRecordCount: 0 });
      await adapter.getGenres('u1', 'lib1', kinds, 20, 40);
      const url = api.request.mock.calls[0][0].url as string;
      expect(url).toContain(expectedPath);
      expect(url).toContain('ParentId=lib1');
      expect(url).toContain('StartIndex=20');
      expect(url).toContain('Limit=40');
    }
  });

  it('Genres 翻译：id/name/imageUrl', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Items: [{ Id: 'g1', Name: 'Action', ImageTags: { Primary: 'tag1' } }],
      TotalRecordCount: 1,
    });
    const page = await adapter.getGenres('u1', 'lib1', ['Movie']);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('g1');
    expect(page.items[0].name).toBe('Action');
    expect(page.items[0].imageUrl).toContain('/Items/g1/Images/Primary');
    expect(page.items[0].imageUrl).toContain('tag=tag1');
  });

  it('Tags 兼容 {Items} 与 string[] 两种响应', async () => {
    const emby = makeAdapter('EMBY', {
      Items: [{ Id: 't1', Name: 'Action' }],
      TotalRecordCount: 1,
    });
    const embyPage = await emby.adapter.getTags('u1', 'lib1');
    expect(embyPage.items).toEqual([{ id: 't1', name: 'Action', imageUrl: undefined, childCount: undefined }]);
    expect(embyPage.total).toBe(1);

    const jellyfin = makeAdapter('JELLYFIN', ['Action', 'Drama']);
    const jellyfinPage = await jellyfin.adapter.getTags('u1', 'lib1');
    expect(jellyfinPage.items.map((item) => [item.id, item.name])).toEqual([
      ['Action', 'Action'],
      ['Drama', 'Drama'],
    ]);
    expect(jellyfinPage.total).toBe(2);
  });

  it('Studios URL 与翻译', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [{ Id: 's1', Name: 'Studio', ChildCount: 3 }],
      TotalRecordCount: 1,
    });
    const page = await adapter.getStudios('u1', 'lib1');
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/Studios?');
    expect(page.items).toEqual([
      { id: 's1', name: 'Studio', imageUrl: undefined, childCount: 3 },
    ]);
  });
});

describe('LiveTV 列表', () => {
  it('Channels：频道号/channelId/台标', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [
        {
          Id: 'ch1',
          Type: 'TvChannel',
          Name: 'CCTV1',
          ChannelNumber: '101',
          ImageTags: { Primary: 't1' },
        },
      ],
      TotalRecordCount: 1,
    });
    const page = await adapter.getLiveTvChannels('u1', 0, 40);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/LiveTv/Channels?');
    expect(url).toContain('UserId=u1');
    expect(page.items[0].type).toBe('TvChannel');
    expect(page.items[0].channelNumber).toBe('101');
    expect(page.items[0].channelId).toBe('ch1');
    expect(page.items[0].posterImageUrl).toContain('/Items/ch1/Images/Primary');
  });

  it('Programs：时间窗/channelId/副标题', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [
        {
          Id: 'p1',
          Type: 'Program',
          Name: '节目',
          ChannelId: 'ch1',
          ChannelName: 'CCTV1',
          StartDate: '2026-11-02T10:00:00Z',
          EndDate: '2026-11-02T11:00:00Z',
        },
      ],
      TotalRecordCount: 1,
    });
    const page = await adapter.getLiveTvPrograms('u1', 0, 40);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/LiveTv/Programs?');
    expect(url).toContain('SortBy=StartDate');
    expect(page.items[0].type).toBe('Program');
    expect(page.items[0].channelId).toBe('ch1');
    expect(page.items[0].startMs).toBe(Date.parse('2026-11-02T10:00:00Z'));
    expect(page.items[0].endMs).toBe(Date.parse('2026-11-02T11:00:00Z'));
    expect(page.items[0].subtext).toBe('CCTV1');
  });

  it('Recordings：类型与分页参数', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [{ Id: 'r1', Type: 'Recording', Name: '录制' }],
      TotalRecordCount: 1,
    });
    const page = await adapter.getLiveTvRecordings('u1', 40, 40);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/LiveTv/Recordings?');
    expect(url).toContain('StartIndex=40');
    expect(page.items[0].type).toBe('Recording');
  });

  it('Timers/SeriesTimers 兼容数组与 {Items}', async () => {
    const timer = makeAdapter('EMBY', [
      { Id: 't1', Type: 'Timer', Name: '计划', StartDate: '2026-11-02T10:00:00Z' },
    ]);
    const timerList = await timer.adapter.getLiveTvTimers('u1');
    expect(timerList[0].type).toBe('Timer');
    expect(timerList[0].startMs).toBe(Date.parse('2026-11-02T10:00:00Z'));

    const seriesTimer = makeAdapter('JELLYFIN', {
      Items: [{ Id: 'st1', Type: 'SeriesTimer', Name: '系列计划' }],
    });
    const seriesList = await seriesTimer.adapter.getLiveTvSeriesTimers('u1');
    expect(seriesList[0].type).toBe('SeriesTimer');
  });
});

describe('插件频道与通用歌单', () => {
  it('getPluginChannels 返回实体摘要', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [{ Id: 'p1', Name: '插件频道', ImageTags: { Primary: 't1' } }],
    });
    const channels = await adapter.getPluginChannels('u1');
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/Channels?');
    expect(channels[0]).toMatchObject({ id: 'p1', name: '插件频道' });
  });

  it('getPluginChannelItems 走 /Channels/{id}/Items', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [{ Id: 'm1', Type: 'Movie', Name: '频道电影' }],
      TotalRecordCount: 1,
    });
    const page = await adapter.getPluginChannelItems('u1', 'p1', 0, 40);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/Channels/p1/Items?');
    expect(page.items[0].type).toBe('Movie');
  });

  it('getPlaylistEntries 通用翻译（Audio + Movie）', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [
        { Id: 'a1', Type: 'Audio', Name: '歌曲' },
        { Id: 'm1', Type: 'Movie', Name: '电影' },
      ],
    });
    const entries = await adapter.getPlaylistEntries('u1', 'pl1');
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('/Playlists/pl1/Items?');
    expect(entries.map((item) => item.type)).toEqual(['Audio', 'Movie']);
  });
});
