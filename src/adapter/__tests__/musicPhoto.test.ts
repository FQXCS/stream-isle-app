/**
 * 音乐/照片十个查询方法单测（M5 文档 §6.1：路径与 query 断言；AlbumArtistIds/Fields=ChildCount/
 * Fields=Path/Playlists 端点/分页参数/fileName 解析/曲序多键排序）。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';
import { PAGE_SIZE } from '@/constant/browse';
import { PHOTO_PAGE_SIZE } from '@/constant/photo';

/** 注入 api 的 adapter 构造（与 listItems.test.ts 同款） */
function makeAdapter(flavor: 'JELLYFIN' | 'EMBY', response: unknown = { Items: [], TotalRecordCount: 0, StartIndex: 0 }) {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor({ baseUrl: 'http://srv', flavor, token: 'tok' }, { api: api as unknown as ApiClient });
  return { adapter, api };
}

/** 服务器条目原始形态（音乐/照片消费字段） */
function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: 'itm-1',
    Type: 'MusicAlbum',
    Name: '测试专辑',
    ImageTags: { Primary: 'abc' },
    ...overrides,
  };
}

describe('音乐四区查询', () => {
  it('getMusicAlbums：ParentId/IncludeItemTypes=MusicAlbum/SortBy=SortName/Fields=ChildCount/分页', async () => {
    const { adapter, api } = makeAdapter('EMBY', { Items: [], TotalRecordCount: 80, StartIndex: 40 });
    const page = await adapter.getMusicAlbums('u1', 'lib1', 1);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url.startsWith('http://srv/Users/u1/Items?')).toBe(true);
    expect(url).toContain('ParentId=lib1');
    expect(url).toContain('IncludeItemTypes=MusicAlbum');
    expect(url).toContain('Recursive=true');
    expect(url).toContain('SortBy=SortName');
    expect(url).toContain('Fields=PrimaryImageAspectRatio%2CChildCount');
    expect(url).toContain(`StartIndex=${PAGE_SIZE}`);
    expect(url).toContain(`Limit=${PAGE_SIZE}`);
    expect(page.total).toBe(80);
    expect(page.startIndex).toBe(40);
  });

  it('getMusicArtists：IncludeItemTypes=MusicArtist', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getMusicArtists('u1', 'lib1', 0);
    expect(api.request.mock.calls[0][0].url).toContain('IncludeItemTypes=MusicArtist');
  });

  it('getAllSongs：排序由音乐库菜单传入（含音频专有 Album/AlbumArtist 映射）', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getAllSongs('u1', 'lib1', 0, { sortBy: 'ALBUM_ARTIST', sortOrder: 'DESC' });
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('SortBy=AlbumArtist');
    expect(url).toContain('SortOrder=Descending');
    expect(url).toContain('Fields=PrimaryImageAspectRatio%2CChildCount%2CUserData');
  });

  it('音频列表翻译：UserData.IsFavorite → AudioItem.favorite（行内收藏按钮初始态）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        { Id: 'a1', Type: 'Audio', Name: '歌甲', UserData: { IsFavorite: true } },
        { Id: 'a2', Type: 'Audio', Name: '歌乙', UserData: { IsFavorite: false } },
      ],
      TotalRecordCount: 2,
    });
    const list = await adapter.getArtistHotSongs('u1', 'art-1');
    expect(list.map((item) => item.favorite)).toEqual([true, false]);
  });

  it('getMusicArtists：排序透传，缺省仍为 SortName 升序', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getMusicArtists('u1', 'lib1', 0, { sortBy: 'DATE_CREATED', sortOrder: 'DESC' });
    const customUrl = api.request.mock.calls[0][0].url as string;
    expect(customUrl).toContain('SortBy=DateCreated');
    expect(customUrl).toContain('SortOrder=Descending');

    await adapter.getMusicArtists('u1', 'lib1', 0);
    const defaultUrl = api.request.mock.calls[1][0].url as string;
    expect(defaultUrl).toContain('SortBy=SortName');
    expect(defaultUrl).toContain('SortOrder=Ascending');
  });

  it('getMusicPlaylists：IncludeItemTypes=Playlist 且不带 ParentId（歌单为服务端全局条目）', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getMusicPlaylists('u1', 0);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('IncludeItemTypes=Playlist');
    expect(url).not.toContain('ParentId=');
  });

  it('getAllSongs：IncludeItemTypes=Audio，翻译 artistName=AlbumArtist??Artists[0]/曲目号/时长/封面', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [
        item({
          Type: 'Audio',
          AlbumArtist: '歌手甲',
          Artists: ['歌手乙'],
          AlbumId: 'alb-1',
          Album: '专辑名',
          IndexNumber: 3,
          RunTimeTicks: 200_000_000, // 20s → 20000ms
        }),
      ],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.getAllSongs('u1', 'lib1', 0);
    expect(page.items).toHaveLength(1);
    const song = page.items[0];
    expect(song.artistName).toBe('歌手甲');
    expect(song.albumId).toBe('alb-1');
    expect(song.albumName).toBe('专辑名');
    expect(song.indexNumber).toBe(3);
    expect(song.runtimeMs).toBe(20_000);
    expect(song.coverImageUrl).toContain('http://srv/Items/itm-1/Images/Primary');
    expect(song.coverImageUrl).toContain('maxWidth=600');
  });

  it('getAllSongs：无 AlbumArtist 时回退 Artists[0]', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [item({ Type: 'Audio', Artists: ['歌手乙'] })],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.getAllSongs('u1', 'lib1', 0);
    expect(page.items[0].artistName).toBe('歌手乙');
  });
});

describe('专辑/艺术家/歌单详情查询', () => {
  it('getAlbumTracks：ParentId=albumId + SortBy=ParentIndexNumber,IndexNumber,SortName 多键排序', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getAlbumTracks('u1', 'alb-1');
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('ParentId=alb-1');
    expect(url).toContain('IncludeItemTypes=Audio');
    expect(url).toContain(
      `SortBy=${encodeURIComponent('ParentIndexNumber,IndexNumber,SortName')}`
    );
    expect(url).toContain(
      `SortOrder=${encodeURIComponent('Ascending,Ascending,Ascending')}`
    );
    // 专辑数量级小，不翻页（无 StartIndex/Limit 分页参数）
    expect(url).not.toContain('StartIndex=');
    expect(url).not.toContain('&Limit=');
  });

  it('getArtistAlbums：优先 AlbumArtistIds，空结果回退 ArtistIds + IncludeItemTypes=MusicAlbum', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getArtistAlbums('u1', 'art-1', 0);
    const primaryUrl = api.request.mock.calls[0][0].url as string;
    const fallbackUrl = api.request.mock.calls[1][0].url as string;
    expect(primaryUrl).toContain('AlbumArtistIds=art-1');
    expect(fallbackUrl).toContain('ArtistIds=art-1');
    expect(primaryUrl).toContain('IncludeItemTypes=MusicAlbum');
  });

  it('getArtistHotSongs：优先 ArtistIds，空结果回退 AlbumArtistIds；SortBy=PlayCount 降序 + Limit=20', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getArtistHotSongs('u1', 'art-1');
    const primaryUrl = api.request.mock.calls[0][0].url as string;
    const fallbackUrl = api.request.mock.calls[1][0].url as string;
    expect(primaryUrl).toContain('ArtistIds=art-1');
    expect(fallbackUrl).toContain('AlbumArtistIds=art-1');
    expect(primaryUrl).toContain('IncludeItemTypes=Audio');
    expect(primaryUrl).toContain('SortBy=PlayCount');
    expect(primaryUrl).toContain('SortOrder=Descending');
    expect(primaryUrl).toContain('Limit=20');
  });

  it('getPlaylistItems：专用端点 /Playlists/{id}/Items?UserId=（保证歌单自定义顺序）', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.getPlaylistItems('u1', 'pl-1');
    const url = api.request.mock.calls[0][0].url as string;
    expect(url.startsWith('http://srv/Playlists/pl-1/Items?')).toBe(true);
    expect(url).toContain('UserId=u1');
  });
});

describe('照片查询', () => {
  it('getPhotoAlbums：IncludeItemTypes=PhotoAlbum + Fields=ChildCount，翻译 childCount', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [item({ Type: 'PhotoAlbum', ChildCount: 12 })],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.getPhotoAlbums('u1', 'lib1', 0);
    expect(page.items[0].childCount).toBe(12);
    const url = (adapter as unknown as { api: { request: jest.Mock } }).api.request.mock.calls[0][0].url as string;
    expect(url).toContain('IncludeItemTypes=PhotoAlbum');
    expect(url).toContain('Fields=PrimaryImageAspectRatio%2CChildCount');
  });

  it('getPhotos：IncludeItemTypes=Photo + Fields=Path + 页大小 60；三个宽度 URL 预拼 + fileName=Path basename + 添加日期/发行时间', async () => {
    const { adapter, api } = makeAdapter('EMBY', {
      Items: [
        item({
          Type: 'Photo',
          Name: '照片名',
          Path: '/media/photos/IMG_0001.jpg',
          Width: 8000,
          Height: 6000,
          DateCreated: '2026-01-02T03:04:05Z',
          PremiereDate: '2025-12-31T00:00:00Z',
        }),
      ],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.getPhotos('u1', 'alb-1', 0, { gridMaxWidth: 390, viewerMaxWidth: 1170 });
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('ParentId=alb-1');
    expect(url).toContain('IncludeItemTypes=Photo');
    expect(url).toContain(
      'Fields=PrimaryImageAspectRatio%2CPath%2CWidth%2CHeight%2CDateCreated%2CPremiereDate'
    );
    expect(url).toContain(`Limit=${PHOTO_PAGE_SIZE}`);
    const photo = page.items[0];
    expect(photo.gridImageUrl).toContain('maxWidth=390');
    expect(photo.viewerImageUrl).toContain('maxWidth=1170');
    // 原图：不带 maxWidth/quality 参数（「查看原图」/保存用）
    expect(photo.originalImageUrl).toBe('http://srv/Items/itm-1/Images/Primary?api_key=tok');
    expect(photo.width).toBe(8000);
    expect(photo.height).toBe(6000);
    expect(photo.fileName).toBe('IMG_0001.jpg');
    expect(photo.path).toBe('/media/photos/IMG_0001.jpg');
    expect(photo.takenAtMs).toBe(Date.parse('2026-01-02T03:04:05Z'));
    expect(photo.premiereDateMs).toBe(Date.parse('2025-12-31T00:00:00Z'));
  });

  it('getPhotos：Path 缺失时 fileName 回退 name 且 path 不下发', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [item({ Type: 'Photo', Name: '照片名' })],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.getPhotos('u1', 'alb-1', 0, { gridMaxWidth: 390, viewerMaxWidth: 1170 });
    expect(page.items[0].fileName).toBe('照片名');
    expect(JSON.stringify(page.items[0])).not.toContain('/media/photos');
  });

  it('getPhotos：Type 词表外条目跳过（统一模型不透传脏值）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      Items: [item({ Type: 'Folder', Name: '目录' })],
      TotalRecordCount: 1,
      StartIndex: 0,
    });
    const page = await adapter.getPhotos('u1', 'alb-1', 0, { gridMaxWidth: 390, viewerMaxWidth: 1170 });
    expect(page.items).toHaveLength(0);
  });

  it('双实例跑一遍 getPhotos 参数（设计 §6.1「以联调验证为准」的单测兜底）', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.getPhotos('u1', 'alb-1', 2, { gridMaxWidth: 390, viewerMaxWidth: 1170 });
      const url = api.request.mock.calls[0][0].url as string;
      expect(url.startsWith(`http://srv/Users/u1/Items?`)).toBe(true);
      expect(url).toContain(`StartIndex=${PHOTO_PAGE_SIZE * 2}`);
    }
  });
});
