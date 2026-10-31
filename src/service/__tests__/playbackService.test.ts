/**
 * PlaybackService 单测（M2 文档 §6.1 PlaybackService 行 + M3 §6.1 PlaybackService.finish 增量）：
 * resolve 包装会话（profileInputs 组装断言见 playbackRestart.test.ts）；finish 的 Stopped 重试
 * 恰好 1 次、兜底 markPlayed（reason 短路 / ≥95%）；M3 会话治理：转码会话 finish 追加
 * stopTranscodingSession，直连会话不调用。
 */
import type { PlaybackSession } from '@/adapter/model';
import { STOPPED_RETRY_DELAY_MS } from '@/constant/playback';
import { getActiveAdapter } from '@/service/adapterProvider';
import { PlaybackService } from '@/service/PlaybackService';
import { usePlayerStore } from '@/store/playerStore';

jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: jest.fn(),
}));

jest.mock('@/store/accountStore', () => ({
  useAccountStore: {
    getState: () => ({ active: { serverId: 's1', userId: 'u1' } }),
  },
}));

jest.mock('@/infra/mediaCaps', () => ({
  fetchDecoderCaps: jest.fn().mockResolvedValue({
    supportsHevcMain10: false,
    supportsVp9: false,
    supportsAv1: false,
  }),
}));

const mockAdapter = {
  resolvePlayback: jest.fn(),
  getNextUp: jest.fn().mockResolvedValue([]),
  reportPlaying: jest.fn().mockResolvedValue(undefined),
  reportStopped: jest.fn().mockResolvedValue(undefined),
  markPlayed: jest.fn().mockResolvedValue(undefined),
  stopTranscodingSession: jest.fn().mockResolvedValue(undefined),
};

const SOURCE = {
  playSessionId: 'ps-1',
  itemId: 'item1',
  mediaSourceId: 'ms-1',
  playMethod: 'DirectPlay' as const,
  url: 'http://srv/Videos/item1/stream?static=true&MediaSourceId=ms-1&api_key=tok',
  positionMsAtStart: 0,
  runTimeMs: 100_000,
  subtitleList: [],
  audioList: [],
};

/** 构造会话（runTimeMs/playMethod 等可覆盖） */
function session(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
  return { ...SOURCE, startedAtEpochMs: 1, ...overrides };
}

describe('PlaybackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveAdapter as jest.Mock).mockReturnValue(mockAdapter);
    usePlayerStore.getState().reset();
  });

  describe('resolve', () => {
    it('透传 opts 给 adapter.resolvePlayback 并包装为会话', async () => {
      mockAdapter.resolvePlayback.mockResolvedValue(SOURCE);
      const service = new PlaybackService();
      const result = await service.resolve('item1', { startPositionMs: 30_000, mediaSourceId: 'ms-1' });
      expect(mockAdapter.resolvePlayback).toHaveBeenCalledWith(
        'u1',
        'item1',
        expect.objectContaining({ mediaSourceId: 'ms-1', startPositionMs: 30_000 })
      );
      expect(result).toMatchObject(SOURCE);
      expect(typeof result.startedAtEpochMs).toBe('number');
    });
  });

  describe('begin', () => {
    it('上报 Playing（当前位置）', async () => {
      const service = new PlaybackService();
      await service.begin(session(), 30_000);
      expect(mockAdapter.reportPlaying).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item1',
          playSessionId: 'ps-1',
          mediaSourceId: 'ms-1',
          positionMs: 30_000,
          playMethod: 'DirectPlay',
        })
      );
    });
  });

  describe('finish（兜底标记）', () => {
    it('natural_end：runtimeMs 缺失也标记已看（reason 短路）', async () => {
      const service = new PlaybackService();
      await service.finish(session({ runTimeMs: undefined }), 0, 'natural_end');
      expect(mockAdapter.reportStopped).toHaveBeenCalledTimes(1);
      expect(mockAdapter.markPlayed).toHaveBeenCalledWith('u1', 'item1');
    });

    it('user_exit：<95% 不标记、≥95% 标记', async () => {
      const service = new PlaybackService();
      await service.finish(session({ runTimeMs: 100_000 }), 94_000, 'user_exit');
      expect(mockAdapter.markPlayed).not.toHaveBeenCalled();
      await service.finish(session({ runTimeMs: 100_000 }), 95_000, 'user_exit');
      expect(mockAdapter.markPlayed).toHaveBeenCalledTimes(1);
    });

    it('error：同 user_exit 口径', async () => {
      const service = new PlaybackService();
      await service.finish(session({ runTimeMs: 100_000 }), 50_000, 'error');
      expect(mockAdapter.markPlayed).not.toHaveBeenCalled();
      await service.finish(session({ runTimeMs: 100_000 }), 96_000, 'error');
      expect(mockAdapter.markPlayed).toHaveBeenCalledTimes(1);
    });
  });

  describe('finish（Stopped 失败重试）', () => {
    it('Stopped 失败重试恰好 1 次（延迟 STOPPED_RETRY_DELAY_MS），重试成功后兜底标记照常', async () => {
      jest.useFakeTimers();
      try {
        mockAdapter.reportStopped.mockRejectedValueOnce(new Error('network'));
        const service = new PlaybackService();
        const pending = service.finish(session({ runTimeMs: 100_000 }), 50_000, 'natural_end');
        // 重试前的延迟窗口内：只发过 1 次失败
        await jest.advanceTimersByTimeAsync(STOPPED_RETRY_DELAY_MS - 1);
        expect(mockAdapter.reportStopped).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(1);
        await pending;
        // 恰好重试 1 次（共 2 次调用），markPlayed 照常
        expect(mockAdapter.reportStopped).toHaveBeenCalledTimes(2);
        expect(mockAdapter.markPlayed).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('重试也失败：静默不抛出，兜底标记照常', async () => {
      jest.useFakeTimers();
      try {
        mockAdapter.reportStopped.mockRejectedValue(new Error('network'));
        const service = new PlaybackService();
        const pending = service.finish(session({ runTimeMs: 100_000 }), 50_000, 'user_exit');
        await jest.advanceTimersByTimeAsync(STOPPED_RETRY_DELAY_MS);
        await expect(pending).resolves.toBeUndefined();
        expect(mockAdapter.reportStopped).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('兜底 markPlayed 失败静默不抛出', async () => {
      mockAdapter.markPlayed.mockRejectedValueOnce(new Error('network'));
      const service = new PlaybackService();
      await expect(
        service.finish(session({ runTimeMs: 100_000 }), 100_000, 'natural_end')
      ).resolves.toBeUndefined();
    });
  });

  describe('playNextEpisode（04 §4.4 自动连播）', () => {
    // mock adapter 直返，故为 adapter 翻译后的 EpisodeItem 形态（含小驼峰字段）
    const upNext = {
      id: 'ep9',
      type: 'Episode' as const,
      name: '第九集',
      seriesId: 'seriesA',
      seasonId: 'season1',
      indexNumber: 9,
      userData: { played: false, playCount: 0, favorite: false, playbackPositionMs: 0 },
    };

    it('命中当前剧集下一集：resolve 该集（startPositionMs=0），返回会话携带连播判定字段', async () => {
      mockAdapter.getNextUp.mockResolvedValue([upNext]);
      mockAdapter.resolvePlayback.mockResolvedValue(SOURCE);
      const service = new PlaybackService();
      const result = await service.playNextEpisode(session({ itemId: 'ep8', itemType: 'Episode', seriesId: 'seriesA' }));
      expect(mockAdapter.getNextUp).toHaveBeenCalledWith('u1');
      expect(mockAdapter.resolvePlayback).toHaveBeenCalledWith(
        'u1',
        'ep9',
        expect.objectContaining({ startPositionMs: 0 })
      );
      // 连播判定字段随新会话下传：第二集播完仍可继续连播第三集（返工意见 1）
      expect(result).toMatchObject({ itemId: 'item1', name: '第 9 集 第九集', itemType: 'Episode', seriesId: 'seriesA' });
    });

    it('NextUp 无当前剧集的集（其他剧的下一集）：返回 null，不跨剧跳集', async () => {
      mockAdapter.getNextUp.mockResolvedValue([{ ...upNext, seriesId: 'seriesB' }]);
      const service = new PlaybackService();
      await expect(
        service.playNextEpisode(session({ itemType: 'Episode', seriesId: 'seriesA' }))
      ).resolves.toBeNull();
      expect(mockAdapter.resolvePlayback).not.toHaveBeenCalled();
    });

    it('会话 seriesId 缺失：直接返回 null（宁可不连播不跳错剧，返工意见 3）', async () => {
      const service = new PlaybackService();
      await expect(service.playNextEpisode(session({ itemType: 'Episode' }))).resolves.toBeNull();
      expect(mockAdapter.getNextUp).not.toHaveBeenCalled();
    });

    it('NextUp 为空：返回 null', async () => {
      mockAdapter.getNextUp.mockResolvedValue([]);
      const service = new PlaybackService();
      await expect(
        service.playNextEpisode(session({ itemType: 'Episode', seriesId: 'seriesA' }))
      ).resolves.toBeNull();
    });
  });

  describe('finish（M3 会话治理，03 §4.6.3）', () => {
    it('转码会话：Stopped 之后追加 stopTranscodingSession', async () => {
      const service = new PlaybackService();
      await service.finish(session({ playMethod: 'Transcode', playSessionId: 'ps-t' }), 50_000, 'user_exit');
      expect(mockAdapter.stopTranscodingSession).toHaveBeenCalledTimes(1);
      expect(mockAdapter.stopTranscodingSession).toHaveBeenCalledWith('ps-t');
      // 顺序：Stopped 先于 DELETE
      expect(mockAdapter.reportStopped.mock.invocationCallOrder[0]).toBeLessThan(
        mockAdapter.stopTranscodingSession.mock.invocationCallOrder[0]
      );
    });

    it('转码会话 stopTranscodingSession 失败不抛出（幂等吞错）', async () => {
      mockAdapter.stopTranscodingSession.mockRejectedValueOnce(new Error('network'));
      const service = new PlaybackService();
      await expect(
        service.finish(session({ playMethod: 'Transcode' }), 50_000, 'user_exit')
      ).resolves.toBeUndefined();
    });

    it('直连会话：不调用 stopTranscodingSession', async () => {
      const service = new PlaybackService();
      await service.finish(session({ playMethod: 'DirectPlay' }), 50_000, 'user_exit');
      expect(mockAdapter.stopTranscodingSession).not.toHaveBeenCalled();
    });
  });
});
