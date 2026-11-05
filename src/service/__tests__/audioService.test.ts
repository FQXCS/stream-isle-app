/**
 * AudioService 单测（M5 文档 §6.1）：jest.mock @rntp/player（v5）+ fake adapter 断言调用序列——
 * repeatMode 映射、shuffle 打乱/恢复、removeFromQueue 当前曲先 skip、moveInQueue 索引映射、
 * playQueue/addToQueue 会话 id 规则、事件序列（MediaItemTransition → 上一曲 Stopped + 新曲 Playing、
 * PlaybackStateChanged(Ended)/stop/PlaybackError → Stopped）。
 */
import type { AudioItem, PlaybackSession } from '@/adapter/model';
import TrackPlayer, { Event, PlaybackState, RepeatMode } from '@rntp/player';
import { getActiveAdapter } from '@/service/adapterProvider';
import { AudioService } from '@/service/AudioService';
import { showCenterToast, showToast } from '@/component/Toast';
import { usePlayerStore } from '@/store/playerStore';

/**
 * 全量 mock（不 requireActual：真实包在模块作用域访问原生 TurboModule，
 * jest 环境无原生模块必炸）。常量枚举按包内源码值手工镜像（字符串与原生分发约定一致）。
 * v5 API 为同步返回（void/直返值），mock 用同步实现。
 */
jest.mock('@rntp/player', () => {
  const Event = {
    MediaItemTransition: 'event.media-item-transition',
    PlaybackStateChanged: 'event.playback-state-changed',
    IsPlayingChanged: 'event.is-playing-changed',
    PlaybackProgressUpdated: 'event.playback-progress-updated',
    PlaybackError: 'event.playback-error',
  };
  const PlaybackState = {
    Idle: 'idle',
    Ready: 'ready',
    Buffering: 'buffering',
    Ended: 'ended',
    Error: 'error',
  };
  const RepeatMode = { Off: 'off', One: 'one', All: 'all' };
  const PlayerCommand = {
    Seek: 'seek',
    PlayPause: 'playPause',
    Next: 'next',
    Previous: 'previous',
    Stop: 'stop',
    SkipForward: 'skipForward',
    SkipBackward: 'skipBackward',
  };
  return {
    __esModule: true,
    Event,
    PlaybackState,
    RepeatMode,
    PlayerCommand,
    default: {
      setupPlayer: jest.fn(),
      setCommands: jest.fn(),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      setMediaItems: jest.fn(),
      addMediaItems: jest.fn(),
      skipToIndex: jest.fn(),
      skipToNext: jest.fn(),
      skipToPrevious: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(),
      moveMediaItem: jest.fn(),
      removeMediaItem: jest.fn(),
      removeMediaItems: jest.fn(),
      setRepeatMode: jest.fn(),
      clear: jest.fn(),
      getQueue: jest.fn(() => [] as unknown[]),
      getActiveMediaItemIndex: jest.fn(() => 0 as number | null),
      isPlaying: jest.fn(() => false),
      getPlaybackState: jest.fn(() => 'ready'),
      getProgress: jest.fn(() => ({ position: 0, duration: 0, buffered: 0, cached: 0 })),
    },
  };
});

jest.mock('@/component/Toast', () => ({
  showToast: jest.fn(),
  showCenterToast: jest.fn(),
}));

jest.mock('@/infra/mediaCaps', () => ({
  fetchDecoderCaps: jest.fn().mockResolvedValue({
    supportsHevcMain10: false,
    supportsVp9: false,
    supportsAv1: false,
  }),
}));

// 内部 ProgressService 经 getActiveAdapter 上报（M2 既有注入面）：指向共享 fake adapter
jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: jest.fn(),
}));

/** fake adapter（断言上报调用序列；模块级共享——内部 ProgressService 经 getActiveAdapter 取同一实例） */
const sharedAdapter = {
  flavor: 'EMBY' as const,
  baseUrl: 'http://srv',
  reportPlaying: jest.fn().mockResolvedValue(undefined),
  reportProgress: jest.fn().mockResolvedValue(undefined),
  reportStopped: jest.fn().mockResolvedValue(undefined),
};

function makeFakeAdapter() {
  return sharedAdapter;
}

/** fake 决策：URL 直拼（不触达 adapter） */
function makeFakeResolve() {
  return jest.fn(
    async (itemId: string, opts?: { playSessionId?: string }): Promise<PlaybackSession> => ({
      playSessionId: opts?.playSessionId ?? 'ps-default',
      itemId,
      mediaSourceId: itemId,
      playMethod: 'Universal',
      url: `http://srv/Audio/${itemId}/universal?PlaySessionId=${opts?.playSessionId ?? 'ps-default'}`,
      positionMsAtStart: 0,
      subtitleList: [],
      audioList: [],
      startedAtEpochMs: 0,
    })
  );
}

function song(id: string, name: string = id): AudioItem {
  return { id, name, artistName: '歌手', runtimeMs: 180_000, coverImageUrl: 'http://srv/img' };
}

/** 取 addEventListener 捕获的事件监听器 */
function listenerOf(event: Event): (payload: unknown) => Promise<void> {
  const calls = (TrackPlayer.addEventListener as jest.Mock).mock.calls;
  const found = calls.find((call) => call[0] === event);
  if (!found) {
    throw new Error(`事件未订阅：${event}`);
  }
  return found[1];
}

function makeService(adapter = makeFakeAdapter(), resolve = makeFakeResolve()): AudioService {
  return new AudioService({ getAdapter: () => adapter as never, resolveAudio: resolve });
}

/** v5 MediaItem 最小形态（mediaId 对应 v4 Track.id） */
const MEDIA_OF = (id: string) => ({ mediaId: id, url: `http://srv/Audio/${id}/universal`, title: id });

beforeEach(() => {
  jest.clearAllMocks();
  (getActiveAdapter as jest.Mock).mockReturnValue(sharedAdapter);
  usePlayerStore.getState().resetAudio();
});

describe('ensureSetup（幂等）', () => {
  it('setupPlayer + setCommands 各一次；事件订阅不在 ensureSetup 内', async () => {
    const service = makeService();
    await service.ensureSetup();
    await service.ensureSetup();
    expect(TrackPlayer.setupPlayer).toHaveBeenCalledTimes(1);
    expect(TrackPlayer.setupPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ progressSync: { intervalSeconds: 30 } })
    );
    expect(TrackPlayer.setCommands).toHaveBeenCalledTimes(1);
    expect(TrackPlayer.setCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.arrayContaining(['playPause', 'next', 'previous', 'seek']),
      })
    );
    expect(TrackPlayer.addEventListener).not.toHaveBeenCalled();
  });

  it('attachPlaybackSession：订阅 5 类事件且幂等；ensureSetup 后仍可挂载', async () => {
    const service = makeService();
    await service.ensureSetup();
    service.attachPlaybackSession();
    service.attachPlaybackSession();
    expect(TrackPlayer.addEventListener).toHaveBeenCalledTimes(5);
  });

  it('setupPlayer 失败 → 状态置 error 并抛 AUDIO_ENGINE_INIT_FAILED；失败后可重试', async () => {
    (TrackPlayer.setupPlayer as jest.Mock).mockImplementationOnce(() => {
      throw new Error('rom blocked');
    });
    const service = makeService();
    await expect(service.ensureSetup()).rejects.toThrow('音频引擎初始化失败，请重启应用');
    expect(usePlayerStore.getState().audio.status).toBe('error');
    await expect(service.ensureSetup()).resolves.toBeUndefined();
  });
});

describe('playQueue / addToQueue（会话 id 规则，§4.4）', () => {
  it('playQueue：新 playSessionId + setMediaItems(items, startIndex)/play 序列 + store 镜像', async () => {
    const resolve = makeFakeResolve();
    const service = makeService(makeFakeAdapter(), resolve);
    await service.playQueue([song('a'), song('b')], 1);
    expect(TrackPlayer.setMediaItems).toHaveBeenCalledTimes(1);
    const [items, startIndex] = (TrackPlayer.setMediaItems as jest.Mock).mock.calls[0];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ mediaId: 'a', duration: 180, artworkUrl: 'http://srv/img' });
    expect(startIndex).toBe(1);
    expect(TrackPlayer.play).toHaveBeenCalledTimes(1);
    // 两曲共用同一队列级 playSessionId
    const psIdA = resolve.mock.calls[0][1]?.playSessionId;
    const psIdB = resolve.mock.calls[1][1]?.playSessionId;
    expect(psIdA).toBe(psIdB);
    expect(usePlayerStore.getState().audio.queueLength).toBe(2);
    expect(usePlayerStore.getState().audio.shuffle).toBe(false);
  });

  it('addToQueue 队列非空沿用活跃 playSessionId；为空生成新值并起播', async () => {
    const resolve = makeFakeResolve();
    const service = makeService(makeFakeAdapter(), resolve);
    await service.addToQueue([song('a')]);
    const firstId = resolve.mock.calls[0][1]?.playSessionId;
    expect(TrackPlayer.skipToIndex).toHaveBeenCalledWith(0);
    expect(TrackPlayer.play).toHaveBeenCalledTimes(1);

    await service.playQueue([song('b')], 0);
    await service.addToQueue([song('c')]);
    // playQueue 生成新 id，addToQueue 沿用
    const playQueueId = resolve.mock.calls[1][1]?.playSessionId;
    const appendId = resolve.mock.calls[2][1]?.playSessionId;
    expect(playQueueId).not.toBe(firstId);
    expect(appendId).toBe(playQueueId);
    expect(usePlayerStore.getState().audio.queueLength).toBe(2);
  });

  it('addToQueue 去重：跳过原生队列已有曲目与入参自身重复项，仅追加新增项', async () => {
    const service = makeService();
    await service.playQueue([song('a'), song('b')], 0);
    (TrackPlayer.getQueue as jest.Mock).mockReturnValueOnce([MEDIA_OF('a'), MEDIA_OF('b')]);
    const addedCount = await service.addToQueue([song('b'), song('c'), song('c')]);
    expect(addedCount).toBe(1);
    const added = (TrackPlayer.addMediaItems as jest.Mock).mock.calls[0][0];
    expect(added.map((item: { mediaId?: string }) => item.mediaId)).toEqual(['c']);
    expect(usePlayerStore.getState().audio.queueLength).toBe(3);
    expect(showCenterToast).toHaveBeenCalledWith('已添加至播放队列');
  });

  it('addToQueue 全为已有曲目：不追加、长度不变并提示', async () => {
    const service = makeService();
    await service.playQueue([song('a')], 0);
    (TrackPlayer.getQueue as jest.Mock).mockReturnValueOnce([MEDIA_OF('a')]);
    await expect(service.addToQueue([song('a')])).resolves.toBe(0);
    expect(TrackPlayer.addMediaItems).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().audio.queueLength).toBe(1);
    expect(showToast).toHaveBeenCalledWith('歌曲已在播放队列中');
    expect(showCenterToast).not.toHaveBeenCalled();
  });
});

describe('clearQueueKeepCurrent（清空队列保留当前曲）', () => {
  it('仅移除当前曲以外的条目，不 clear、不停止播放，长度归 1', async () => {
    const service = makeService();
    await service.playQueue([song('a'), song('b'), song('c')], 1);
    (TrackPlayer.getQueue as jest.Mock).mockReturnValueOnce([
      MEDIA_OF('a'),
      MEDIA_OF('b'),
      MEDIA_OF('c'),
    ]);
    (TrackPlayer.getActiveMediaItemIndex as jest.Mock).mockReturnValueOnce(1);
    await service.clearQueueKeepCurrent();
    expect(TrackPlayer.removeMediaItems).toHaveBeenNthCalledWith(1, 2, 3);
    expect(TrackPlayer.removeMediaItems).toHaveBeenNthCalledWith(2, 0, 1);
    expect(TrackPlayer.clear).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().audio.queueLength).toBe(1);
    expect(usePlayerStore.getState().audio.shuffle).toBe(false);
  });
});

describe('播放模式（§4.5）', () => {
  it('setRepeatMode：off/track/queue → RepeatMode.Off/One/All 映射并写 store', async () => {
    const service = makeService();
    await service.setRepeatMode('off');
    expect(TrackPlayer.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.Off);
    await service.setRepeatMode('track');
    expect(TrackPlayer.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.One);
    await service.setRepeatMode('queue');
    expect(TrackPlayer.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.All);
    expect(usePlayerStore.getState().audio.repeatMode).toBe('queue');
  });

  it('toggleShuffle 开：仅移除当前曲之后的区段、打乱追加、集合不变、当前曲不动', async () => {
    const service = makeService();
    await service.playQueue([song('a'), song('b'), song('c')], 0);
    (TrackPlayer.getActiveMediaItemIndex as jest.Mock).mockReturnValue(0);
    (TrackPlayer.getQueue as jest.Mock).mockReturnValue([MEDIA_OF('a'), MEDIA_OF('b'), MEDIA_OF('c')]);
    await service.toggleShuffle();
    // 当前曲（index 0）与已播区段不触碰；待播区段 [1,3) 移除后打乱追加
    expect(TrackPlayer.removeMediaItems).toHaveBeenCalledWith(1, 3);
    const appended = (TrackPlayer.addMediaItems as jest.Mock).mock.calls[0][0] as { mediaId: string }[];
    // 集合不变（b/c 都在追加列表中）
    expect(appended.map((item) => item.mediaId).sort()).toEqual(['b', 'c']);
    expect(usePlayerStore.getState().audio.shuffle).toBe(true);
    expect(usePlayerStore.getState().audio.queueLength).toBe(3);
  });

  it('toggleShuffle 关：当前曲之后的区段按原序 move 恢复（无重新 add，当前曲不中断）', async () => {
    const service = makeService();
    // 原序 a,b,c,d；起播 b（index 1）
    await service.playQueue([song('a'), song('b'), song('c'), song('d')], 1);
    (TrackPlayer.getActiveMediaItemIndex as jest.Mock).mockReturnValue(1);
    // 随机后队列形态：已播+当前 [a,b] 不动，待播区段 [d,c] 为打乱结果
    (TrackPlayer.getQueue as jest.Mock).mockReturnValue([
      MEDIA_OF('a'),
      MEDIA_OF('b'),
      MEDIA_OF('d'),
      MEDIA_OF('c'),
    ]);
    usePlayerStore.getState().setAudioState({ shuffle: true });
    await service.toggleShuffle();
    // c 按原序应排在 b 之后：从 index 3 move 到 index 2；d 随后自然就位（无多余 move）
    expect(TrackPlayer.moveMediaItem).toHaveBeenCalledTimes(1);
    expect(TrackPlayer.moveMediaItem).toHaveBeenCalledWith(3, 2);
    expect(usePlayerStore.getState().audio.shuffle).toBe(false);
  });
});

describe('removeFromQueue / moveInQueue（§4.11）', () => {
  it('移除当前曲：优先先 skipToNext 再 removeMediaItem（播放不中断）', async () => {
    const service = makeService();
    await service.playQueue([song('a'), song('b')], 0);
    (TrackPlayer.getActiveMediaItemIndex as jest.Mock).mockReturnValue(0);
    await service.removeFromQueue(0);
    expect(TrackPlayer.skipToNext).toHaveBeenCalledTimes(1);
    expect(TrackPlayer.removeMediaItem).toHaveBeenCalledWith(0);
    expect(usePlayerStore.getState().audio.queueLength).toBe(1);
  });

  it('移除当前曲且为队尾：skipToPrevious 兜底', async () => {
    const service = makeService();
    await service.playQueue([song('a'), song('b')], 0);
    (TrackPlayer.getActiveMediaItemIndex as jest.Mock).mockReturnValue(1);
    await service.removeFromQueue(1);
    expect(TrackPlayer.skipToPrevious).toHaveBeenCalledTimes(1);
    expect(TrackPlayer.removeMediaItem).toHaveBeenCalledWith(1);
  });

  it('移除其他曲：直接 removeMediaItem（索引补偿由播放器内部处理）', async () => {
    const service = makeService();
    await service.playQueue([song('a'), song('b'), song('c')], 0);
    (TrackPlayer.getActiveMediaItemIndex as jest.Mock).mockReturnValue(1);
    await service.removeFromQueue(0);
    expect(TrackPlayer.skipToNext).not.toHaveBeenCalled();
    expect(TrackPlayer.skipToPrevious).not.toHaveBeenCalled();
    expect(TrackPlayer.removeMediaItem).toHaveBeenCalledWith(0);
    expect(usePlayerStore.getState().audio.queueLength).toBe(2);
  });

  it('moveInQueue 索引映射：moveMediaItem(from, to) 原样传递', async () => {
    const service = makeService();
    await service.moveInQueue(2, 0);
    expect(TrackPlayer.moveMediaItem).toHaveBeenCalledWith(2, 0);
  });
});

describe('事件 → 上报接线（§4.5 事件表）', () => {
  it('MediaItemTransition：上一曲 Stopped（自记 lastActiveItem）+ 新曲 Playing(positionMs=0)', async () => {
    const adapter = makeFakeAdapter();
    const service = makeService(adapter);
    service.attachPlaybackSession();
    await service.playQueue([song('a'), song('b')], 0);
    // 首曲生效（无上一曲，不报 Stopped）
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('a'), index: 0, reason: 'playlistChanged' });
    expect(adapter.reportPlaying).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'a', positionMs: 0, playMethod: 'Universal' })
    );
    expect(usePlayerStore.getState().audio.currentTrack?.id).toBe('a');
    // 切歌：上一曲 Stopped + 新曲 Playing
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('b'), index: 1, reason: 'auto' });
    expect(adapter.reportStopped).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'a', playMethod: 'Universal' })
    );
    expect(adapter.reportPlaying).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemId: 'b' })
    );
    expect(usePlayerStore.getState().audio.currentTrack?.id).toBe('b');
  });

  it('MediaItemTransition 晚到且原生已播放：状态保持 playing，不回退 buffering', async () => {
    const service = makeService();
    service.attachPlaybackSession();
    await service.playQueue([song('a')], 0);
    // 清空队列后事件可能乱序：IsPlayingChanged(true) 先到，MediaItemTransition 后到且原生已在播
    (TrackPlayer.isPlaying as jest.Mock).mockReturnValue(true);
    usePlayerStore.getState().setAudioState({ status: 'playing' });
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('a'), index: 0, reason: 'playlistChanged' });
    expect(usePlayerStore.getState().audio.status).toBe('playing');
    (TrackPlayer.isPlaying as jest.Mock).mockReturnValue(false);
  });

  it('清空队列的 MediaItemTransition(item=undefined) 后首次点歌：不抛错且正常激活', async () => {
    const service = makeService();
    service.attachPlaybackSession();
    await service.playQueue([song('a')], 0);
    // 原生清空事件可能把 item 置 undefined（类型声明为 null，运行时不保证）：
    // 未归一化时下一次切歌会在 previous.mediaId 抛 TypeError，首次点歌事件链中断
    await listenerOf(Event.MediaItemTransition)({ item: undefined });
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('a'), index: 0, reason: 'playlistChanged' });
    expect(usePlayerStore.getState().audio.currentTrack?.id).toBe('a');
  });

  it('PlaybackStateChanged(Ended)：末曲 Stopped；stop()：clear + 当前曲 Stopped + store 复位', async () => {
    const adapter = makeFakeAdapter();
    const service = makeService(adapter);
    service.attachPlaybackSession();
    await service.playQueue([song('a')], 0);
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('a'), index: 0, reason: 'playlistChanged' });
    await listenerOf(Event.PlaybackStateChanged)({ state: PlaybackState.Ended });
    expect(adapter.reportStopped).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'a' })
    );

    await service.stop();
    expect(adapter.reportStopped).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemId: 'a' })
    );
    expect(TrackPlayer.clear).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().audio.status).toBe('idle');
    expect(usePlayerStore.getState().audio.currentTrack).toBeNull();
  });

  it('stop() 清空后再 playQueue：engineReady 保持就绪（清空后点歌迷你条仍可见）', async () => {
    const service = makeService();
    await service.playQueue([song('a')], 0);
    expect(usePlayerStore.getState().audio.engineReady).toBe(true);

    await service.stop();
    expect(usePlayerStore.getState().audio.status).toBe('idle');

    // 引擎（setupPromise）已初始化，resetAudio 不应把就绪标记永久清掉；
    // 否则清空队列后点歌虽然入队，但迷你条/NowPlaying 入口全部隐藏，表现为「点了没反应」
    await service.playQueue([song('b')], 0);
    expect(usePlayerStore.getState().audio.engineReady).toBe(true);
    expect(usePlayerStore.getState().audio.queueLength).toBe(1);
  });

  it('PlaybackError：状态置 error + 当前曲 Stopped；IsPlayingChanged 即时 Progress', async () => {
    const adapter = makeFakeAdapter();
    const service = makeService(adapter);
    service.attachPlaybackSession();
    await service.playQueue([song('a')], 0);
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('a'), index: 0, reason: 'playlistChanged' });

    await listenerOf(Event.PlaybackError)({ code: 'source', message: '解码失败' });
    expect(adapter.reportStopped).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'a' })
    );
    expect(usePlayerStore.getState().audio.status).toBe('error');

    usePlayerStore.getState().setAudioState({ status: 'playing' });
    await listenerOf(Event.IsPlayingChanged)({ playing: false });
    expect(adapter.reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'a', isPaused: true })
    );
    await listenerOf(Event.IsPlayingChanged)({ playing: true });
    expect(adapter.reportProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemId: 'a', isPaused: false })
    );
  });

  it('Ended 后的 IsPlayingChanged(false) 不重复走暂停链（末曲收尾由 Ended 分支承担）', async () => {
    const adapter = makeFakeAdapter();
    const service = makeService(adapter);
    service.attachPlaybackSession();
    await service.playQueue([song('a')], 0);
    await listenerOf(Event.MediaItemTransition)({ item: MEDIA_OF('a'), index: 0, reason: 'playlistChanged' });
    await listenerOf(Event.PlaybackStateChanged)({ state: PlaybackState.Ended });
    const stoppedCalls = (adapter.reportStopped as jest.Mock).mock.calls.length;
    await listenerOf(Event.IsPlayingChanged)({ playing: false });
    expect(adapter.reportStopped).toHaveBeenCalledTimes(stoppedCalls);
    expect(adapter.reportProgress).not.toHaveBeenCalled();
  });
});
