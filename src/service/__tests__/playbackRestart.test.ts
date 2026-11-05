/**
 * PlaybackService 会话重启/切换单测（M3 文档 §6.1 PlaybackService.restart 行）：
 * 重启时序（Stopped→DELETE→resolve(startPositionMs=快照) 顺序）、switchSubtitle 三分支、
 * 重启不触发 markPlayed、switchResolution 直连返回 null 且不写 settingsStore、音轨保持与回填、
 * subtitleTarget="keep" 不重放自动选轨。
 * store 用真实 zustand 实例（settingsStore/playerStore），adapter/accountStore/mediaCaps 注入 mock。
 */
import type { PlaybackSession, ResolvePlaybackOpts } from '@/adapter/model';
import { getActiveAdapter } from '@/service/adapterProvider';
import { PlaybackService } from '@/service/PlaybackService';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fetchDecoderCaps } from '@/infra/mediaCaps';

jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: jest.fn(),
}));

jest.mock('@/store/accountStore', () => ({
  useAccountStore: {
    getState: () => ({ active: { serverId: 's1', userId: 'u1' } }),
  },
}));

jest.mock('@/infra/mediaCaps', () => ({
  fetchDecoderCaps: jest.fn(),
}));

const MOCK_CAPS = { supportsHevcMain10: true, supportsVp9: false, supportsAv1: false };
const mockAdapter = {
  resolvePlayback: jest.fn(),
  reportPlaying: jest.fn().mockResolvedValue(undefined),
  reportProgress: jest.fn().mockResolvedValue(undefined),
  reportStopped: jest.fn().mockResolvedValue(undefined),
  markPlayed: jest.fn().mockResolvedValue(undefined),
  stopTranscodingSession: jest.fn().mockResolvedValue(undefined),
};

/** 转码旧会话（含字幕/音轨轨表） */
function transcodeSession(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
  return {
    playSessionId: 'ps-old',
    itemId: 'item1',
    mediaSourceId: 'ms-1',
    playMethod: 'Transcode',
    url: 'http://srv/hls.m3u8?api_key=x',
    positionMsAtStart: 0,
    runTimeMs: 100_000,
    subtitleList: [
      { streamIndex: 3, language: 'chi', title: '简中', isExternal: true, burnIn: false },
      { streamIndex: 4, title: '特效字幕', isExternal: false, burnIn: true, format: 'ass' },
    ],
    audioList: [
      { streamIndex: 1, title: '日语', isDefault: true },
      { streamIndex: 2, title: '英语' },
    ],
    startedAtEpochMs: 1,
    ...overrides,
  };
}

/** 直连会话 */
function directSession(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
  return {
    ...transcodeSession(),
    playMethod: 'DirectPlay',
    playSessionId: 'ps-d',
    url: 'http://srv/stream?api_key=x',
    ...overrides,
  };
}

/** resolve mock 默认返回的新会话（转码，新 PlaySessionId） */
const NEW_SOURCE = {
  playSessionId: 'ps-new',
  itemId: 'item1',
  mediaSourceId: 'ms-1',
  playMethod: 'Transcode' as const,
  url: 'http://srv/hls-new.m3u8?api_key=x',
  positionMsAtStart: 40_000,
  runTimeMs: 100_000,
  maxResolutionTier: 'FHD' as const,
  subtitleList: transcodeSession().subtitleList,
  audioList: transcodeSession().audioList,
};

describe('PlaybackService（M3 会话重启与切换）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveAdapter as jest.Mock).mockReturnValue(mockAdapter);
    (fetchDecoderCaps as jest.Mock).mockResolvedValue(MOCK_CAPS);
    mockAdapter.resolvePlayback.mockResolvedValue(NEW_SOURCE);
    // store 归零
    usePlayerStore.getState().reset();
    useSettingsStore.setState({ maxResolutionTier: 'UNLIMITED', allowHevcDirectPlay: true });
  });

  describe('resolve（profileInputs 组装）', () => {
    it('以 settingsStore 开关/档位 + mediaCaps 缓存组装 profileInputs', async () => {
      useSettingsStore.setState({ maxResolutionTier: 'FHD', allowHevcDirectPlay: false });
      const service = new PlaybackService();
      await service.resolve('item1', { startPositionMs: 5_000 });
      expect(mockAdapter.resolvePlayback).toHaveBeenCalledWith('u1', 'item1', {
        mediaSourceId: undefined,
        startPositionMs: 5_000,
        maxResolutionTier: 'FHD',
        audioStreamIndex: undefined,
        subtitleStreamIndex: undefined,
        profileInputs: { allowHevcDirectPlay: false, decoderCaps: MOCK_CAPS },
      });
    });
  });

  describe('switchResolution', () => {
    it('直连会话返回 null，且不写 settingsStore、不重启（自动降档路径同口径）', async () => {
      const before = useSettingsStore.getState().maxResolutionTier;
      const service = new PlaybackService();
      const result = await service.switchResolution(directSession(), 'SD');
      expect(result).toBeNull();
      expect(mockAdapter.resolvePlayback).not.toHaveBeenCalled();
      expect(mockAdapter.reportStopped).not.toHaveBeenCalled();
      expect(useSettingsStore.getState().maxResolutionTier).toBe(before);
      expect(usePlayerStore.getState().isRestartingSession).toBe(false);
    });

    it('转码会话：beginRestart → 时序 Stopped→DELETE→resolve(maxResolutionTier=新档, startPositionMs=快照) → 回填', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().updateProgress(40_000, 0, 100_000);
      usePlayerStore.getState().setActiveSubtitle(3);
      const service = new PlaybackService();
      const promise = service.switchResolution(transcodeSession(), 'SD');
      expect(usePlayerStore.getState().isRestartingSession).toBe(true);
      const newSession = await promise;
      // 调用顺序：Stopped → DELETE → resolve
      const order = mockAdapter.reportStopped.mock.invocationCallOrder[0];
      const deleteOrder = mockAdapter.stopTranscodingSession.mock.invocationCallOrder[0];
      const resolveOrder = mockAdapter.resolvePlayback.mock.invocationCallOrder[0];
      expect(order).toBeLessThan(deleteOrder);
      expect(deleteOrder).toBeLessThan(resolveOrder);
      // Stopped 带旧会话与快照位置
      expect(mockAdapter.reportStopped).toHaveBeenCalledWith(
        expect.objectContaining({ playSessionId: 'ps-old', positionMs: 40_000, playMethod: 'Transcode' })
      );
      expect(mockAdapter.stopTranscodingSession).toHaveBeenCalledWith('ps-old');
      // resolve 入参：快照位置 + 新档位；未显式传音轨时保持当前选中（null → undefined）
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.startPositionMs).toBe(40_000);
      expect(opts.maxResolutionTier).toBe('SD');
      expect(opts.subtitleStreamIndex).toBeUndefined();
      // store：新会话就位；subtitleTarget=keep → activeSubtitle 保持
      expect(newSession).not.toBeNull();
      expect(newSession?.playSessionId).toBe('ps-new');
      expect(usePlayerStore.getState().session?.playSessionId).toBe('ps-new');
      expect(usePlayerStore.getState().activeSubtitleStreamIndex).toBe(3);
      // 重启不触发 markPlayed 兜底
      expect(mockAdapter.markPlayed).not.toHaveBeenCalled();
    });

    it('起播加载阶段（status=loading）重启：起点沿用旧会话续播点，不被 0 进度覆盖', async () => {
      // 蜂窝自动降档会在首帧 onLoad 前触发重启，此时 positionMs 恒为 0
      const oldSession = transcodeSession({ positionMsAtStart: 59_011 });
      usePlayerStore.getState().setSession(oldSession, { resetTrackSelection: true });
      usePlayerStore.getState().setStatus('loading');
      const service = new PlaybackService();
      await service.switchResolution(oldSession, 'SD');
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.startPositionMs).toBe(59_011);
    });

    it('手动切换也不写 settingsStore（持久化由调用方 ResolutionMenu 负责）', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      const service = new PlaybackService();
      await service.switchResolution(transcodeSession(), 'SD');
      expect(useSettingsStore.getState().maxResolutionTier).toBe('UNLIMITED');
    });

    it('蜂窝降档态（旧会话 720p）切字幕重启：maxResolutionTier 沿用旧会话，不抬升回用户档位（03 §4.9）', async () => {
      useSettingsStore.setState({ maxResolutionTier: 'UNLIMITED' });
      usePlayerStore.getState().setActiveSubtitle(4); // 激活烧录轨（出烧录路径必重启）
      const service = new PlaybackService();
      // 出烧录重启（overrides 不含 maxResolutionTier）：沿用旧会话降档档位
      await service.switchSubtitle(transcodeSession({ maxResolutionTier: 'HD' }), null);
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.maxResolutionTier).toBe('HD');
    });

    it('蜂窝降档态切音轨重启：maxResolutionTier 同样沿用旧会话', async () => {
      useSettingsStore.setState({ maxResolutionTier: 'UNLIMITED' });
      const service = new PlaybackService();
      await service.switchAudioTrack(transcodeSession({ maxResolutionTier: 'HD' }), { streamIndex: 2 });
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.maxResolutionTier).toBe('HD');
    });

    it('直连旧会话（无档位记录）切烧录字幕转转码：回落 settingsStore 用户档位', async () => {
      useSettingsStore.setState({ maxResolutionTier: 'FHD' });
      const service = new PlaybackService();
      await service.switchSubtitle(directSession(), transcodeSession().subtitleList[1]!);
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.maxResolutionTier).toBe('FHD');
    });
  });

  describe('switchSubtitle（三分支）', () => {
    it('文本→文本/关闭：纯客户端切换（null，不重启）', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().setActiveSubtitle(3);
      const service = new PlaybackService();
      const result = await service.switchSubtitle(transcodeSession(), null);
      expect(result).toBeNull();
      expect(usePlayerStore.getState().activeSubtitleStreamIndex).toBeNull();
      expect(mockAdapter.resolvePlayback).not.toHaveBeenCalled();
      expect(mockAdapter.reportStopped).not.toHaveBeenCalled();
    });

    it('文本→烧录：重启带 subtitleStreamIndex=目标轨，回填 activeSubtitle=烧录轨', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().setActiveSubtitle(3);
      usePlayerStore.getState().updateProgress(30_000, 0, 100_000);
      const service = new PlaybackService();
      await service.switchSubtitle(transcodeSession(), transcodeSession().subtitleList[1]!);
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.subtitleStreamIndex).toBe(4);
      expect(opts.startPositionMs).toBe(30_000);
      expect(usePlayerStore.getState().activeSubtitleStreamIndex).toBe(4);
      expect(mockAdapter.stopTranscodingSession).toHaveBeenCalledWith('ps-old');
      expect(mockAdapter.markPlayed).not.toHaveBeenCalled();
    });

    it('烧录→关闭：重启不带 subtitleStreamIndex（显式 undefined），回填 activeSubtitle=null', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().setActiveSubtitle(4);
      const service = new PlaybackService();
      await service.switchSubtitle(transcodeSession(), null);
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.subtitleStreamIndex).toBeUndefined();
      expect('subtitleStreamIndex' in opts).toBe(true); // 显式不带（区别于烧录保持）
      expect(usePlayerStore.getState().activeSubtitleStreamIndex).toBeNull();
    });

    it('烧录→文本轨：重启不带烧录索引，回填 activeSubtitle=目标文本轨', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().setActiveSubtitle(4);
      const service = new PlaybackService();
      await service.switchSubtitle(transcodeSession(), transcodeSession().subtitleList[0]!);
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.subtitleStreamIndex).toBeUndefined();
      expect(usePlayerStore.getState().activeSubtitleStreamIndex).toBe(3);
    });
  });

  describe('switchAudioTrack', () => {
    it('直连会话返回 null（ExoPlayer selectedAudioTrack 即时生效，页面处理）', async () => {
      const service = new PlaybackService();
      const result = await service.switchAudioTrack(directSession(), { streamIndex: 2 });
      expect(result).toBeNull();
      expect(mockAdapter.resolvePlayback).not.toHaveBeenCalled();
    });

    it('转码会话：重启带 audioStreamIndex，重启后 activeAudio 回填为请求轨；字幕保持不重放选轨', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().setActiveSubtitle(3);
      usePlayerStore.getState().setActiveAudio(1);
      usePlayerStore.getState().updateProgress(50_000, 0, 100_000);
      const service = new PlaybackService();
      await service.switchAudioTrack(transcodeSession(), { streamIndex: 2, title: '英语' });
      const opts = mockAdapter.resolvePlayback.mock.calls[0][2] as ResolvePlaybackOpts;
      expect(opts.audioStreamIndex).toBe(2);
      expect(opts.startPositionMs).toBe(50_000);
      // 音轨回填为请求轨
      expect(usePlayerStore.getState().activeAudioStreamIndex).toBe(2);
      // subtitleTarget=keep：字幕选中态保持（不重放自动选轨）
      expect(usePlayerStore.getState().activeSubtitleStreamIndex).toBe(3);
      expect(mockAdapter.stopTranscodingSession).toHaveBeenCalledWith('ps-old');
    });
  });

  describe('resolve（防御式收尾）', () => {
    it('store 存在未收尾旧会话时，先静默 Stopped + DELETE 再 resolve', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      usePlayerStore.getState().updateProgress(12_000, 0, 100_000);
      const service = new PlaybackService();
      await service.resolve('item2');
      const order = mockAdapter.reportStopped.mock.invocationCallOrder[0];
      const deleteOrder = mockAdapter.stopTranscodingSession.mock.invocationCallOrder[0];
      const resolveOrder = mockAdapter.resolvePlayback.mock.invocationCallOrder[0];
      expect(order).toBeLessThan(deleteOrder);
      expect(deleteOrder).toBeLessThan(resolveOrder);
      expect(mockAdapter.resolvePlayback).toHaveBeenCalledWith(
        'u1',
        'item2',
        expect.objectContaining({ startPositionMs: undefined })
      );
      expect(mockAdapter.markPlayed).not.toHaveBeenCalled();
      expect(usePlayerStore.getState().session).toBeNull();
    });
  });

  describe('重启 resolve 失败', () => {
    it('旧参数自动重试 1 次（经 resolveInternal），成功则返回新会话', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      mockAdapter.resolvePlayback
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(NEW_SOURCE);
      const service = new PlaybackService();
      await expect(service.switchResolution(transcodeSession(), 'SD')).resolves.toMatchObject({
        playSessionId: 'ps-new',
      });
      // 第一次失败 + 重试恰好 1 次（共 2 次调用）
      expect(mockAdapter.resolvePlayback).toHaveBeenCalledTimes(2);
    }, 10_000);

    it('重试仍失败 → 向上抛出（页面 finish 收尾退出）', async () => {
      usePlayerStore.getState().setSession(transcodeSession(), { resetTrackSelection: true });
      mockAdapter.resolvePlayback.mockRejectedValue(new Error('network'));
      const service = new PlaybackService();
      await expect(service.switchResolution(transcodeSession(), 'SD')).rejects.toThrow('network');
      expect(mockAdapter.resolvePlayback).toHaveBeenCalledTimes(2);
    }, 10_000);
  });
});
