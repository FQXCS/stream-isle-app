/**
 * adapter.search 单测（04 文档 §6.1 adapter.search 行）：
 * 按类型三次请求的 SearchTerm/IncludeItemTypes/Recursive/Limit=12 参数构造
 * （断言未传 SortBy、端点为 /Users/{uid}/Items 形态）；响应翻译分组
 * （Movie/Series/Person 归组、空组剔除）。
 */
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import { SEARCH_GROUP_LIMIT } from '@/constant/search';
import type { ApiClient } from '@/infra/api/ApiClient';

/** 构造 /Users/{uid}/Items 分页响应形态 */
function itemsResponse(items: unknown[]): { Items: unknown[]; TotalRecordCount: number } {
  return { Items: items, TotalRecordCount: items.length };
}

function makeAdapter(requests: unknown[]): { adapter: JellyfinAdapter; api: { request: jest.Mock } } {
  let call = 0;
  const api = {
    request: jest.fn(() => Promise.resolve(requests[Math.min(call++, requests.length - 1)])),
  };
  const adapter = new JellyfinAdapter(
    { baseUrl: 'http://srv', flavor: 'JELLYFIN', token: 'tok' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('adapter.search（按类型三请求，04 §4.3）', () => {
  it('三次请求参数构造：SearchTerm/IncludeItemTypes/Recursive/Limit=12，未传 SortBy', async () => {
    const { adapter, api } = makeAdapter([itemsResponse([]), itemsResponse([]), itemsResponse([])]);
    await adapter.search('u1', '海贼');
    expect(api.request).toHaveBeenCalledTimes(3);
    const urls = api.request.mock.calls.map((call) => (call[0] as { url: string }).url);
    // 端点为 /Users/{uid}/Items 形态（与 listItems 同形态，04 §4.1 #10）
    urls.forEach((url) => expect(url).toMatch(/^http:\/\/srv\/Users\/u1\/Items\?/));
    expect(urls[0]).toContain('IncludeItemTypes=Movie');
    expect(urls[1]).toContain('IncludeItemTypes=Series');
    expect(urls[2]).toContain('IncludeItemTypes=Person');
    urls.forEach((url) => {
      expect(url).toContain('SearchTerm=');
      expect(url).toContain('Recursive=true');
      expect(url).toContain(`Limit=${SEARCH_GROUP_LIMIT}`);
      // 不传 SortBy（服务器对 SearchTerm 查询按默认相关序返回）
      expect(url).not.toContain('SortBy');
    });
  });

  it('响应翻译分组：Movie/Series/Person 归组，空组剔除，人物头像按 200 宽请求', async () => {
    const { adapter } = makeAdapter([
      itemsResponse([{ Id: 'm1', Type: 'Movie', Name: '电影A', ProductionYear: 2020 }]),
      itemsResponse([]),
      itemsResponse([
        { Id: 'p1', Type: 'Person', Name: '演员甲', ImageTags: { Primary: 'tag-p' } },
      ]),
    ]);
    const groups = await adapter.search('u1', '关键词');
    // 空组（SERIES）剔除
    expect(groups.map((group) => group.kind)).toEqual(['MOVIE', 'PERSON']);
    expect(groups[0].itemList).toHaveLength(1);
    expect(groups[0].itemList[0]).toMatchObject({ id: 'm1', type: 'Movie', name: '电影A' });
    expect(groups[1].itemList[0]).toMatchObject({ id: 'p1', type: 'Person', name: '演员甲' });
    // 人物头像 URL：Primary 图 + maxWidth=200（PERSON_AVATAR_MAX_WIDTH）+ api_key
    expect(groups[1].itemList[0].posterImageUrl).toContain('/Items/p1/Images/Primary');
    expect(groups[1].itemList[0].posterImageUrl).toContain('maxWidth=200');
    expect(groups[1].itemList[0].posterImageUrl).toContain('api_key=tok');
  });

  it('Type 词表外条目跳过（不进统一模型，与 listItems 翻译路径一致）', async () => {
    const { adapter } = makeAdapter([
      itemsResponse([{ Id: 'x1', Type: 'Folder', Name: '目录' }]),
      itemsResponse([]),
      itemsResponse([]),
    ]);
    const groups = await adapter.search('u1', '任意');
    // Movie 组全被跳过 → 空组剔除 → 仅剩空结果
    expect(groups).toEqual([]);
  });
});
