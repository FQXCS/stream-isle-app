/**
 * resolveAudio 单测（M5 文档 §6.1：会话字段 playMethod="Universal"、mediaSourceId=itemId、
 * positionMsAtStart=0、URL 透传、playSessionId 复用/缺省生成）。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';
import { getActiveAdapter } from '@/service/adapterProvider';
import { playbackService } from '@/service/PlaybackService';

jest.mock('@/store/accountStore', () => ({
  useAccountStore: { getState: () => ({ active: { serverId: 's1', userId: 'u1' } }) },
}));

jest.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ maxBitrateMode: 'LOW', allowHevcDirectPlay: true }),
  },
}));

jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: jest.fn(),
}));

jest.mock('@/infra/mediaCaps', () => ({
  fetchDecoderCaps: jest.fn().mockResolvedValue({
    supportsHevcMain10: false,
    supportsVp9: false,
    supportsAv1: false,
  }),
}));

/** 构造真实 BaseAdapter（URL 构造为纯函数，api 不被触达） */
function makeAdapter(): EmbyAdapter {
  return new EmbyAdapter(
    { baseUrl: 'http://srv', flavor: 'EMBY', token: 'tok' },
    { deviceId: 'dev-1', api: { request: jest.fn() } as unknown as ApiClient }
  );
}

describe('PlaybackService.resolveAudio（§8.4 universal 统一端点）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveAdapter as jest.Mock).mockReturnValue(makeAdapter());
  });

  it('会话字段：playMethod=Universal / mediaSourceId=itemId / positionMsAtStart=0 / URL 为 universal', async () => {
    const session = await playbackService.resolveAudio('song-1', { playSessionId: 'ps-1' });
    expect(session.playMethod).toBe('Universal');
    expect(session.mediaSourceId).toBe('song-1');
    expect(session.itemId).toBe('song-1');
    expect(session.positionMsAtStart).toBe(0);
    expect(session.url.startsWith('http://srv/Audio/song-1/universal?')).toBe(true);
    expect(session.url).toContain('PlaySessionId=ps-1');
    // 2Mbps 档位经 settingsStore 解析带入 URL
    expect(session.url).toContain('MaxStreamingBitrate=2000000');
    // 不触发 PlaybackInfo（零请求决策）
    expect((getActiveAdapter() as unknown as { api: { request: jest.Mock } }).api.request).not.toHaveBeenCalled();
  });

  it('playSessionId 缺省时内部生成；runTimeMs 透传为会话时长', async () => {
    const session = await playbackService.resolveAudio('song-1', { runTimeMs: 123_000 });
    expect(session.playSessionId).not.toBe('');
    expect(session.playSessionId).not.toBe('ps-1');
    expect(session.runTimeMs).toBe(123_000);
  });

  it('同一 playSessionId 复用（队列级会话标识，AudioService 持有唯一活跃值）', async () => {
    const a = await playbackService.resolveAudio('song-1', { playSessionId: 'ps-queue' });
    const b = await playbackService.resolveAudio('song-2', { playSessionId: 'ps-queue' });
    expect(a.playSessionId).toBe(b.playSessionId);
  });
});
