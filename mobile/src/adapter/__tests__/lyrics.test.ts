/**
 * adapter 歌词单测（M6 文档 §6.1 BaseAdapter.lyrics 行）：
 * 路径；404 → null；LyricDto 翻译（StartTick→startMs 走 ticksToMs、无 StartTick 行 startMs
 * 缺省）；异常不抛出（其余错误同样降级为 null）。
 */
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import { AppError } from '@/infra/error';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(requestImpl?: () => Promise<unknown>): {
  adapter: JellyfinAdapter;
  api: { request: jest.Mock };
} {
  const api = {
    request: requestImpl ? jest.fn(requestImpl) : jest.fn().mockResolvedValue(undefined),
  };
  const adapter = new JellyfinAdapter(
    { baseUrl: 'http://srv', flavor: 'JELLYFIN', token: 'tok-1' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('BaseAdapter 歌词（M6 §6.1 lyrics 行）', () => {
  it('GET /Audio/{itemId}/Lyrics（需认证）', async () => {
    const { adapter, api } = makeAdapter(() => Promise.resolve({ Lyrics: [] }));
    await adapter.getLyrics('u1', 'a1');
    const req = api.request.mock.calls[0][0];
    expect(req.method).toBe('GET');
    expect(req.url).toBe('http://srv/Audio/a1/Lyrics?userId=u1');
    expect(req.headers.Authorization).toContain('Token="tok-1"');
  });

  it('LyricDto 翻译：StartTick → startMs（ticksToMs）；无 StartTick 行 startMs 缺省', async () => {
    const { adapter } = makeAdapter(() =>
      Promise.resolve({
        Lyrics: [
          { Text: '第一行', StartTick: 120_000_000 }, // Ticks=100ns：120000000 ticks = 12s = 12000ms
          { Text: '纯文本行' },
        ],
      })
    );
    const lines = await adapter.getLyrics('u1', 'a1');
    expect(lines).toEqual([
      { text: '第一行', startMs: 12_000 },
      { text: '纯文本行' },
    ]);
  });

  it('空 Lyrics 数组 → null（无歌词）', async () => {
    const { adapter } = makeAdapter(() => Promise.resolve({ Lyrics: [] }));
    await expect(adapter.getLyrics('u1', 'a1')).resolves.toBeNull();
  });

  it('404 → null（Emby 未实证端点的优雅降级，M6 §4.3.1）', async () => {
    const { adapter } = makeAdapter(() => Promise.reject(new AppError('NOT_FOUND')));
    await expect(adapter.getLyrics('u1', 'a1')).resolves.toBeNull();
  });

  it('其余异常不抛出 → null（网络/服务器错误不阻塞播放）', async () => {
    const { adapter } = makeAdapter(() => Promise.reject(new AppError('SERVER_ERROR')));
    await expect(adapter.getLyrics('u1', 'a1')).resolves.toBeNull();
  });
});
