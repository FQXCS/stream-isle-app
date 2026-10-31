/**
 * BaseAdapter.stopTranscodingSession 单测（M3 文档 §6.1 BaseAdapter.stopTranscoding 行）：
 * Jellyfin 实例 query 为 playSessionId、Emby 实例为 id；失败不抛出（幂等吞错）。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  requestImpl?: () => Promise<unknown>
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = {
    request: requestImpl
      ? jest.fn(requestImpl)
      : jest.fn().mockResolvedValue(undefined),
  };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

describe('stopTranscodingSession（DELETE /Videos/ActiveEncodings，03 §4.5.3）', () => {
  it('Jellyfin 实例：query 参数名 playSessionId', async () => {
    const { adapter, api } = makeAdapter('JELLYFIN');
    await adapter.stopTranscodingSession('ps-1');
    const req = api.request.mock.calls[0][0];
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://srv/Videos/ActiveEncodings?playSessionId=ps-1');
  });

  it('Emby 实例：query 参数名 id（设计文档 §7.2 记载形态）', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.stopTranscodingSession('ps-2');
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: 'DELETE',
      url: 'http://srv/Videos/ActiveEncodings?id=ps-2',
    });
  });

  it('失败不抛出（幂等吞错，不阻塞收尾流程）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', () => Promise.reject(new Error('network')));
    await expect(adapter.stopTranscodingSession('ps-3')).resolves.toBeUndefined();
  });
});
