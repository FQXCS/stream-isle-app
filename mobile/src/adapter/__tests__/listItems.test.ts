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
    expect(url).toContain('Fields=PrimaryImageAspectRatio%2CUserData%2CChildCount');
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

  it('sortBy 映射：Emby 复合字段链（含 SortName 兜底）', async () => {
    const cases: [ItemQuery['sortBy'], string][] = [
      ['SORT_NAME', 'SortBy=SortName'],
      ['DATE_CREATED', 'SortBy=DateCreated%2CSortName'],
      ['PREMIERE_DATE', 'SortBy=ProductionYear%2CPremiereDate%2CSortName'],
      ['COMMUNITY_RATING', 'SortBy=CommunityRating%2CSortName'],
      ['CRITIC_RATING', 'SortBy=CriticRating%2CSortName'],
      ['OFFICIAL_RATING', 'SortBy=OfficialRating%2CSortName'],
      ['PLAY_COUNT', 'SortBy=PlayCount%2CSortName'],
      ['DATE_PLAYED', 'SortBy=DatePlayed%2CSortName'],
      ['FILENAME', 'SortBy=IsFolder%2CFilename'],
      ['RUNTIME', 'SortBy=Runtime%2CSortName'],
      ['FILE_SIZE', 'SortBy=Size%2CSortName'],
      ['CONTAINER', 'SortBy=Container%2CSortName'],
      ['RANDOM', 'SortBy=Random'],
    ];
    for (const [sortBy, expected] of cases) {
      const { adapter, api } = makeAdapter('EMBY');
      await adapter.listItems({ ...BASE_QUERY, sortBy });
      expect(api.request.mock.calls[0][0].url).toContain(expected);
    }
  });

  it('sortBy 映射：Jellyfin 不支持的字段回退 SortName', async () => {
    for (const sortBy of ['FILENAME', 'FILE_SIZE', 'CONTAINER'] as const) {
      const { adapter, api } = makeAdapter('JELLYFIN');
      await adapter.listItems({ ...BASE_QUERY, sortBy });
      expect(api.request.mock.calls[0][0].url).toContain('SortBy=SortName');
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

  it('响应翻译：无自身 Primary 图时用服务器的借用图（PrimaryImageItemId + PrimaryImageTag，Emby 文件夹）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        {
          Id: 'folder1',
          Type: 'Folder',
          Name: 'OVA 示例',
          ChildCount: 3,
          // Emby 文件夹实测形态：ImageTags 为空，靠 PrimaryImageItemId 借子条目的图
          ImageTags: {},
          PrimaryImageItemId: 'child1',
          PrimaryImageTag: 'borrowedtag',
        },
      ],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.listItems({ ...BASE_QUERY, recursive: false });
    expect(page.items[0].posterImageUrl).toContain('/Items/child1/Images/Primary');
    expect(page.items[0].posterImageUrl).toContain('maxWidth=400');
    // Emby 不使用 tag 参数（imageTagQuery 差异），Jellyfin 才拼 tag
    expect(page.items[0].posterImageUrl).not.toContain('tag=');
  });

  it('recursive=false：文件夹浏览只列当前层（Recursive=false）', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.listItems({ ...BASE_QUERY, recursive: false });
    expect(api.request.mock.calls[0][0].url).toContain('Recursive=false');
    // 缺省（不传）仍为整库递归
    const { adapter: wholeAdapter, api: wholeApi } = makeAdapter('EMBY');
    await wholeAdapter.listItems(BASE_QUERY);
    expect(wholeApi.request.mock.calls[0][0].url).toContain('Recursive=true');
  });

  it('响应翻译：Folder 条目进入统一模型（文件夹浏览）并带 childCount', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [{ Id: 'f1', Type: 'Folder', Name: '3D', ChildCount: 24 }],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.listItems({ ...BASE_QUERY, recursive: false });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].type).toBe('Folder');
    expect(page.items[0].name).toBe('3D');
    expect(page.items[0].childCount).toBe(24);
  });

  it('响应翻译：Type 词表外或缺失的条目直接跳过，新扩展类型保留', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        { Id: 'ok1', Type: 'Series', Name: '正常条目' },
        { Id: 'channel1', Type: 'Channel', Name: '频道' },
        { Id: 'trailer1', Type: 'Trailer', Name: '预告' },
        { Id: 'boxset1', Type: 'BoxSet', Name: '合集' },
        { Id: 'unknown1', Type: 'UnknownWidget', Name: '未知' },
        { Id: 'noType', Name: '缺 Type' },
      ],
      TotalRecordCount: 6,
      StartIndex: 0,
    });
    const page = await adapter.listItems(BASE_QUERY);
    expect(page.items.map((item) => item.id)).toEqual(['ok1', 'channel1', 'trailer1', 'boxset1']);
    expect(page.items[0].type).toBe('Series');
    expect(page.items[1].type).toBe('Channel');
    expect(page.items[2].type).toBe('Trailer');
    expect(page.items[3].type).toBe('BoxSet');
  });

  it('响应翻译：Book 条目进入统一模型（books 库海报墙可列）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [{ Id: 'book1', Type: 'Book', Name: '漫画样本' }],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.listItems(BASE_QUERY);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].type).toBe('Book');
    expect(page.items[0].name).toBe('漫画样本');
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
    await adapter.getLibraryItemCount('u1', 'lib1', 'unknown-collection');
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=Movie%2CSeries');
  });

  it('BOOK / homevideos 库口径：Book / PhotoAlbum（books/homevideos 均为词表内映射）', async () => {
    const { adapter, api } = makeAdapter('EMBY', { TotalRecordCount: 550 });
    await adapter.getLibraryItemCount('u1', 'lib1', 'books');
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=Book');
    const { adapter: a2, api: api2 } = makeAdapter('EMBY', { TotalRecordCount: 939 });
    await a2.getLibraryItemCount('u1', 'lib1', 'homevideos');
    expect(api2.request.mock.calls[0][0].url).toContain('IncludeItemTypes=PhotoAlbum');
  });

  it('MUSIC / PHOTO 库口径：Audio（歌曲数）/ PhotoAlbum（相册数）', async () => {
    const { adapter, api } = makeAdapter('EMBY', { TotalRecordCount: 3361 });
    await adapter.getLibraryItemCount('u1', 'lib1', 'music');
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=Audio');
    const { adapter: a2, api: api2 } = makeAdapter('EMBY', { TotalRecordCount: 939 });
    await a2.getLibraryItemCount('u1', 'lib1', 'photos');
    expect(api2.request.mock.calls[0][0].url).toContain('IncludeItemTypes=PhotoAlbum');
  });

  it('新增库类型计数口径：audiobooks/musicvideos/boxsets/playlists/games/livetv/channels/trailers', async () => {
    const cases: [string, string][] = [
      ['audiobooks', 'MusicAlbum'],
      ['musicvideos', 'MusicVideo'],
      ['boxsets', 'BoxSet'],
      ['playlists', 'Playlist'],
      ['games', 'Game'],
      ['livetv', 'TvChannel'],
      ['channels', 'Channel'],
      ['trailers', 'Trailer'],
    ];
    for (const [collectionType, includeItemTypes] of cases) {
      const { adapter, api } = makeAdapter('EMBY', { TotalRecordCount: 1 });
      await adapter.getLibraryItemCount('u1', 'lib1', collectionType);
      expect(api.request.mock.calls[0][0].url).toContain(
        `IncludeItemTypes=${includeItemTypes}`
      );
    }
  });
});
