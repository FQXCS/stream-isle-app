/**
 * 音乐个人歌单 adapter 端点单测（docs/doing/音乐个人歌单.md §7.1）：
 * 创建/加入/移除/移动/重命名五组写操作的请求描述全断言（双 flavor 各跑一遍），
 * getPlaylistItems 的 PlaylistItemId 解析、getMusicPlaylists 排序透传，以及 403 → FORBIDDEN 归一化。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';
import { AppError, normalizeHttpError } from '@/infra/error';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown = {}
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok-1' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('createPlaylist（POST /Playlists，双 flavor）', () => {
  for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
    it(`[${flavor}] query 含 Name/UserId/MediaType=Audio；itemIds 逗号拼接；返回响应 Id`, async () => {
      const { adapter, api } = makeAdapter(flavor, { Id: 'pl-9', Name: '睡前' });
      const id = await adapter.createPlaylist('u1', '睡前', ['a1', 'a2']);
      expect(id).toBe('pl-9');
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('POST');
      expect(req.url).toBe('http://srv/Playlists?Name=%E7%9D%A1%E5%89%8D&Ids=a1%2Ca2&UserId=u1&MediaType=Audio');
    });

    it(`[${flavor}] 空曲目列表省略 Ids（建空歌单）`, async () => {
      const { adapter, api } = makeAdapter(flavor, { Id: 'pl-1' });
      await adapter.createPlaylist('u1', 'list', []);
      expect(api.request.mock.calls[0][0].url).toBe(
        'http://srv/Playlists?Name=list&UserId=u1&MediaType=Audio'
      );
    });

    it(`[${flavor}] 响应缺 Id 抛 UNKNOWN（调用方依赖 id 打开详情）`, async () => {
      const { adapter } = makeAdapter(flavor, {});
      await expect(adapter.createPlaylist('u1', 'list')).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });
  }
});

describe('addToPlaylist / removeFromPlaylist / movePlaylistItem（双 flavor）', () => {
  for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
    it(`[${flavor}] addToPlaylist：POST /Playlists/{id}/Items，Ids 逗号拼接 + UserId`, async () => {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.addToPlaylist('u1', 'pl-1', ['s1', 's2', 's3']);
      expect(api.request.mock.calls[0][0]).toMatchObject({
        method: 'POST',
        url: 'http://srv/Playlists/pl-1/Items?Ids=s1%2Cs2%2Cs3&UserId=u1',
      });
    });

    it(`[${flavor}] removeFromPlaylist：DELETE /Playlists/{id}/Items，仅 EntryIds（无 UserId）`, async () => {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.removeFromPlaylist('pl-1', ['e1', 'e2']);
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('DELETE');
      expect(req.url).toBe('http://srv/Playlists/pl-1/Items?EntryIds=e1%2Ce2');
      expect((req.url as string).includes('UserId')).toBe(false);
    });

    it(`[${flavor}] movePlaylistItem：路径参数形式 /Items/{entryId}/Move/{newIndex}（防退化为 query 形式）`, async () => {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.movePlaylistItem('pl-1', 'e1', 2);
      const req = api.request.mock.calls[0][0];
      expect(req).toMatchObject({
        method: 'POST',
        url: 'http://srv/Playlists/pl-1/Items/e1/Move/2',
      });
    });
  }
});

describe('renamePlaylistItem（读-改-写收敛在 adapter 内）', () => {
  it('GET 原始条目 → POST /Items/{id} 仅改 Name，其余字段原样回传', async () => {
    const raw = { Id: 'pl-1', Name: '旧名', Genres: ['Pop'], LockData: false };
    const { adapter, api } = makeAdapter('EMBY', raw);
    await adapter.renamePlaylistItem('u1', 'pl-1', '新名');
    const getReq = api.request.mock.calls[0][0];
    expect(getReq).toMatchObject({ method: 'GET', url: 'http://srv/Users/u1/Items/pl-1' });
    const postReq = api.request.mock.calls[1][0];
    expect(postReq).toMatchObject({
      method: 'POST',
      url: 'http://srv/Items/pl-1',
      body: { ...raw, Name: '新名' },
    });
  });
});

describe('getPlaylistItems（PlaylistItemId → playlistEntryId）', () => {
  it('响应条目携带 PlaylistItemId 时映射为 playlistEntryId', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Items: [
        { Id: 's1', Name: 'A', Type: 'Audio', PlaylistItemId: 'entry-1' },
        { Id: 's2', Name: 'B', Type: 'Audio', PlaylistItemId: 'entry-2' },
      ],
    });
    const audioList = await adapter.getPlaylistItems('u1', 'pl-1');
    expect(audioList.map((item) => item.playlistEntryId)).toEqual(['entry-1', 'entry-2']);
    expect(audioList[0]?.id).toBe('s1');
  });

  it('PlaylistItemId 缺失/空串时不产出 playlistEntryId（行级降级只读判定依赖）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      Items: [
        { Id: 's1', Name: 'A', Type: 'Audio' },
        { Id: 's2', Name: 'B', Type: 'Audio', PlaylistItemId: '' },
      ],
    });
    const audioList = await adapter.getPlaylistItems('u1', 'pl-1');
    expect(audioList[0]?.playlistEntryId).toBeUndefined();
    expect(audioList[1]?.playlistEntryId).toBeUndefined();
  });
});

describe('getMusicPlaylists（排序透传 + Fields=ChildCount）', () => {
  it('传 sort 时 SortBy/SortOrder 透传（Emby 复合链 DateCreated,SortName）', async () => {
    const { adapter, api } = makeAdapter('EMBY', { Items: [] });
    await adapter.getMusicPlaylists('u1', 0, { sortBy: 'DATE_CREATED', sortOrder: 'DESC' });
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('IncludeItemTypes=Playlist');
    expect(url).toContain(`SortBy=${encodeURIComponent('DateCreated,SortName')}`);
    expect(url).toContain('SortOrder=Descending');
  });

  it('缺省 SortName 升序；query 含 Fields=ChildCount', async () => {
    const { adapter, api } = makeAdapter('EMBY', { Items: [] });
    await adapter.getMusicPlaylists('u1', 0);
    const url = api.request.mock.calls[0][0].url as string;
    expect(url).toContain('SortBy=SortName');
    expect(url).toContain('SortOrder=Ascending');
    expect(url).toContain('ChildCount');
  });
});

describe('403 → FORBIDDEN 归一化（歌单写入无权限提示依赖）', () => {
  it('403 响应归一化为 FORBIDDEN 码', () => {
    const err = normalizeHttpError(
      { response: { status: 403, data: 'Forbidden' } },
      'http://srv/Playlists'
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.httpStatus).toBe(403);
  });
});
