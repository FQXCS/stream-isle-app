/**
 * listItems 参数映射单测（M1 文档 §6.1 listItems 行 / §4.6.3 参数名映射表）。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';
import type { ItemQuery } from '@/adapter/model';

/** 注入 api 的 adapter 构造 */
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

describe('listItems query → URL 参数映射全表', () => {
  it('基础参数：ParentId/Recursive/Limit/Fields/ImageTypeLimit + 默认 SortBy=SortName', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems(BASE_QUERY);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url.startsWith('http://srv/Users/u1/Items?')).toBe(true);
    expect(url).toContain('ParentId=lib1');
    expect(url).toContain('Recursive=true');
    expect(url).toContain('Limit=40');
    expect(url).toContain('Fields=PrimaryImageAspectRatio%2CUserData');
    expect(url).toContain('ImageTypeLimit=1');
    expect(url).toContain('SortBy=SortName');
    expect(url).toContain('StartIndex=0');
    // 不带 Filters / IncludeItemTypes / SortOrder
    expect(url).not.toContain('Filters=');
    expect(url).not.toContain('IncludeItemTypes=');
    expect(url).not.toContain('SortOrder=');
  });

  it('kinds → IncludeItemTypes 原值直传', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems({ ...BASE_QUERY, kinds: ['Movie', 'Series'] });
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=Movie%2CSeries');
  });

  it('sortBy 映射：SORT_NAME→SortName / PREMIERE_DATE→PremiereDate / RANDOM→Random', async () => {
    const cases: [ItemQuery['sortBy'], string][] = [
      ['SORT_NAME', 'SortBy=SortName'],
      ['PREMIERE_DATE', 'SortBy=PremiereDate'],
      ['RANDOM', 'SortBy=Random'],
    ];
    for (const [sortBy, expected] of cases) {
      const { adapter, api } = makeAdapter('EMBY');
      await adapter.listItems({ ...BASE_QUERY, sortBy });
      expect(api.request.mock.calls[0][0].url).toContain(expected);
    }
  });

  it('sortOrder 映射：ASC→Ascending / DESC→Descending', async () => {
    const { adapter: ascAdapter, api: ascApi } = makeAdapter('EMBY');
    await ascAdapter.listItems({ ...BASE_QUERY, sortBy: 'PREMIERE_DATE', sortOrder: 'ASC' });
    expect(ascApi.request.mock.calls[0][0].url).toContain('SortOrder=Ascending');
    const { adapter: descAdapter, api: descApi } = makeAdapter('EMBY');
    await descAdapter.listItems({ ...BASE_QUERY, sortBy: 'PREMIERE_DATE', sortOrder: 'DESC' });
    expect(descApi.request.mock.calls[0][0].url).toContain('SortOrder=Descending');
  });

  it('filters → Filters 原值逗号连接；不传不带参数', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems({ ...BASE_QUERY, filters: ['IsPlayed'] });
    expect(api.request.mock.calls[0][0].url).toContain('Filters=IsPlayed');
    const { adapter: a2, api: api2 } = makeAdapter('EMBY');
    await a2.listItems({ ...BASE_QUERY, filters: ['IsPlayed', 'IsFavorite'] });
    expect(api2.request.mock.calls[0][0].url).toContain('Filters=IsPlayed%2CIsFavorite');
    const { adapter: a3, api: api3 } = makeAdapter('EMBY');
    await a3.listItems(BASE_QUERY);
    expect(api3.request.mock.calls[0][0].url).not.toContain('Filters=');
  });

  it('分页参数直传 StartIndex/Limit', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems({ ...BASE_QUERY, startIndex: 120, limit: 40 });
    expect(api.request.mock.calls[0][0].url).toContain('StartIndex=120');
    expect(api.request.mock.calls[0][0].url).toContain('Limit=40');
  });

  it('响应翻译：Items→统一模型（含 UserData Ticks 换算与海报 URL）、TotalRecordCount→total', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Items: [
        {
          Id: 'item1',
          Type: 'Movie',
          Name: 'Inception',
          ProductionYear: 2010,
          RunTimeTicks: 888_0000_0000,
          ImageTags: { Primary: 'abc123' },
          UserData: { Played: false, PlayCount: 2, IsFavorite: true, PlaybackPositionTicks: 3_0000_0000 },
        },
      ],
      TotalRecordCount: 137,
      StartIndex: 0,
    });
    const page = await adapter.listItems(BASE_QUERY);
    expect(page.total).toBe(137);
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.id).toBe('item1');
    expect(item.type).toBe('Movie');
    expect(item.name).toBe('Inception');
    expect(item.subtext).toBe('2010');
    expect(item.runtimeMs).toBe(8_880_000); // 88800000000 ticks ÷10000 = 8880000 ms = 148 min
    expect(item.userData.playbackPositionMs).toBe(30_000); // 300000000 ticks ÷10000 = 30000 ms
    expect(item.userData.favorite).toBe(true);
    expect(item.userData.playCount).toBe(2);
    // 海报 URL 含 tag（Jellyfin）与 api_key、maxWidth=400、quality=85
    expect(item.posterImageUrl).toContain('/Items/item1/Images/Primary');
    expect(item.posterImageUrl).toContain('tag=abc123');
    expect(item.posterImageUrl).toContain('maxWidth=400');
    expect(item.posterImageUrl).toContain('quality=85');
    expect(item.posterImageUrl).toContain('api_key=tok');
  });

  it('响应翻译：Type 词表外（如 Folder/Channel）或缺失的条目直接跳过，不编造默认类型', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        { Id: 'ok1', Type: 'Series', Name: '正常条目' },
        { Id: 'folder1', Type: 'Folder', Name: '词表外类型' },
        { Id: 'channel1', Type: 'Channel', Name: '频道' },
        { Id: 'noType', Name: '缺 Type' },
      ],
      TotalRecordCount: 4,
      StartIndex: 0,
    });
    const page = await adapter.listItems(BASE_QUERY);
    // 仅词表内条目进入统一模型
    expect(page.items.map((item) => item.id)).toEqual(['ok1']);
    expect(page.items[0].type).toBe('Series');
  });
});

describe('getLibraryItemCount（Limit=0 数量请求构造）', () => {
  it('MOVIE 库：IncludeItemTypes=Movie、Limit=0、Recursive=true', async () => {
    const { adapter, api } = makeAdapter('EMBY', { TotalRecordCount: 42 });
    const count = await adapter.getLibraryItemCount('u1', 'lib1', 'movies');
    expect(count).toBe(42);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('ParentId=lib1');
    expect(url).toContain('Recursive=true');
    expect(url).toContain('Limit=0');
    expect(url).toContain('IncludeItemTypes=Movie');
  });

  it('MIXED 库（未知 CollectionType）：IncludeItemTypes=Movie,Series', async () => {
    const { adapter, api } = makeAdapter('EMBY', { TotalRecordCount: 7 });
    await adapter.getLibraryItemCount('u1', 'lib1', 'homevideos');
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=Movie%2CSeries');
  });

  it('MUSIC / PHOTO 库口径：MusicAlbum / PhotoAlbum', async () => {
    const { adapter, api } = makeAdapter('EMBY', { TotalRecordCount: 3 });
    await adapter.getLibraryItemCount('u1', 'lib1', 'music');
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=MusicAlbum');
    const { adapter: a2, api: api2 } = makeAdapter('EMBY', { TotalRecordCount: 3 });
    await a2.getLibraryItemCount('u1', 'lib1', 'photos');
    expect(api2.request.mock.calls[0][0].url).toContain('IncludeItemTypes=PhotoAlbum');
  });
});
