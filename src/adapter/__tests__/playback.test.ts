/**
 * BaseAdapter 播放决策/上报/已看单测（M2 文档 §6.1 BaseAdapter.playback / BaseAdapter.report 行
 * + M3 §6.1 BaseAdapter.resolvePlayback 行增量）。
 * 双实例（Jellyfin/Emby）各断言一遍路径与 body（认证头差异由 M1 headers 单测覆盖）。
 * M3 增量：PlaybackInfo body（DeviceProfile/AudioStreamIndex/SubtitleStreamIndex）、转码分支、
 * MediaStreams 翻译、vttUrl 三分支、TranscodingUrl 为空 → PLAYBACK_UNSUPPORTED。
 */
import { buildDeviceProfile, type DecoderCapabilities } from '@/adapter/DeviceProfileBuilder';
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';
import type { ProfileInputs, ReportArgs } from '@/adapter/model';

/** 注入 api 的 adapter 构造（同 listItems.test.ts 模式） */
function makeAdapter(
  flavor: 'JELLYFIN' | 'EMBY',
  response: unknown = {}
): { adapter: JellyfinAdapter | EmbyAdapter; api: { request: jest.Mock } } {
  const api = { request: jest.fn().mockResolvedValue(response) };
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  const adapter = new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok' },
    { api: api as unknown as ApiClient }
  );
  return { adapter, api };
}

const CAPS: DecoderCapabilities = {
  supportsHevcMain10: true,
  supportsVp9: true,
  supportsAv1: false,
};
const INPUTS: ProfileInputs = { allowHevcDirectPlay: true, decoderCaps: CAPS };

/** PlaybackInfo 标准响应（单源可直连） */
const DIRECT_RESPONSE = {
  PlaySessionId: 'ps-1',
  MediaSources: [
    {
      Id: 'ms-1',
      Name: '1080p - h264',
      Container: 'mkv',
      RunTimeTicks: 720_000_0000,
      SupportsDirectPlay: true,
      SupportsTranscoding: true,
      TranscodingUrl: '/videos/ms-1/hls1/main.m3u8',
    },
  ],
};

/** PlaybackInfo 标准响应（不可直连、走转码；含字幕/音轨 MediaStreams） */
const TRANSCODE_RESPONSE = {
  PlaySessionId: 'ps-t1',
  MediaSources: [
    {
      Id: 'ms-9',
      Container: 'mkv',
      RunTimeTicks: 600_000_0000,
      SupportsDirectPlay: false,
      SupportsTranscoding: true,
      TranscodingUrl:
        '/videos/ms-9/hls1/main.m3u8?DeviceId=d1&MediaSourceId=ms-9&PlaySessionId=ps-t1&api_key=srvkey',
      MediaStreams: [
        { Index: 0, Type: 'Video', Codec: 'hevc', Width: 1920, Height: 1080 },
        {
          Index: 1,
          Type: 'Audio',
          Codec: 'flac',
          DisplayTitle: '日语 5.1',
          Language: 'jpn',
          Channels: 6,
          IsDefault: true,
        },
        { Index: 2, Type: 'Audio', Codec: 'aac', Title: '评论音轨', Language: 'eng', Channels: 2 },
        {
          Index: 3,
          Type: 'Subtitle',
          Codec: 'srt',
          DisplayTitle: '简体中文',
          Language: 'chi',
          IsDefault: true,
          IsForced: false,
          DeliveryMethod: 'External',
          DeliveryUrl: '/Videos/i1/ms-9/Subtitles/3/Stream.vtt?api_key=srvkey',
        },
        {
          Index: 4,
          Type: 'Subtitle',
          Codec: 'ass',
          Title: '特效字幕',
          DeliveryMethod: 'Encode',
        },
        { Index: 5, Type: 'Subtitle', Codec: 'subrip' },
      ],
    },
  ],
};

describe('resolvePlayback（PlaybackInfo body：DeviceProfile/索引参数）', () => {
  it('双实例：POST 路径 + body（UserId/MediaSourceId?/DeviceProfile=buildDeviceProfile(profileInputs)）', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor, DIRECT_RESPONSE);
      await adapter.resolvePlayback('u1', 'item1', {
        mediaSourceId: 'ms-1',
        startPositionMs: 30_000,
        profileInputs: INPUTS,
      });
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('POST');
      expect(req.url).toBe('http://srv/Items/item1/PlaybackInfo');
      expect(req.body).toEqual({
        UserId: 'u1',
        MediaSourceId: 'ms-1',
        DeviceProfile: buildDeviceProfile({
          maxResolutionTier: 'UNLIMITED',
          allowHevcDirectPlay: true,
          decoderCaps: CAPS,
        }),
      });
    }
  });

  it('body 带 AudioStreamIndex/SubtitleStreamIndex（烧录/音轨重启路径）', async () => {
    const { adapter, api } = makeAdapter('EMBY', DIRECT_RESPONSE);
    await adapter.resolvePlayback('u1', 'item1', {
      audioStreamIndex: 2,
      subtitleStreamIndex: 4,
      profileInputs: INPUTS,
    });
    expect(api.request.mock.calls[0][0].body).toMatchObject({
      AudioStreamIndex: 2,
      SubtitleStreamIndex: 4,
    });
  });

  it('maxResolutionTier 透传转码档 MaxWidth/MaxHeight 与内置码率上限', async () => {
    const { adapter, api } = makeAdapter('EMBY', DIRECT_RESPONSE);
    await adapter.resolvePlayback('u1', 'item1', {
      maxResolutionTier: 'SD',
      profileInputs: INPUTS,
    });
    const profile = api.request.mock.calls[0][0].body.DeviceProfile;
    expect(profile.MaxStreamingBitrate).toBe(4_000_000);
    expect(profile.TranscodingProfiles[0]).toMatchObject({ MaxWidth: 854, MaxHeight: 480 });
  });
});

describe('resolvePlayback（直连分支，M2 回归）', () => {
  it('直连 URL：static=true + MediaSourceId + api_key，且不包含 TranscodingUrl 改写', async () => {
    const { adapter } = makeAdapter('EMBY', DIRECT_RESPONSE);
    const source = await adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS });
    expect(source.url).toBe(
      'http://srv/Videos/item1/stream?static=true&MediaSourceId=ms-1&api_key=tok'
    );
    expect(source.playMethod).toBe('DirectPlay');
    expect(source.playSessionId).toBe('ps-1');
    expect(source.mediaSourceId).toBe('ms-1');
    expect(source.runTimeMs).toBe(720_000); // RunTimeTicks → ms
    expect(source.maxResolutionTier).toBeUndefined(); // 直连不记分辨率档位
  });

  it('多 MediaSource：未传 mediaSourceId 取第一个可直连源（M2 行为不变）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      PlaySessionId: 'ps-2',
      MediaSources: [
        { Id: 'ms-a', Container: 'mkv', SupportsDirectPlay: false, SupportsTranscoding: true, TranscodingUrl: '/x.m3u8' },
        { Id: 'ms-b', Container: 'mp4', SupportsDirectPlay: true, SupportsTranscoding: false, TranscodingUrl: '/y.m3u8' },
      ],
    });
    const source = await adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS });
    expect(source.mediaSourceId).toBe('ms-b');
    expect(source.url).toContain('MediaSourceId=ms-b');
    expect(source.url).not.toContain('m3u8');
  });

  it('传 mediaSourceId 时精确匹配该源（03 §4.5.1 源选取）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      PlaySessionId: 'ps-2',
      MediaSources: [
        { Id: 'ms-a', Container: 'mkv', SupportsDirectPlay: false, SupportsTranscoding: true, TranscodingUrl: '/x.m3u8' },
        { Id: 'ms-b', Container: 'mp4', SupportsDirectPlay: true, SupportsTranscoding: false },
      ],
    });
    const source = await adapter.resolvePlayback('u1', 'item1', {
      mediaSourceId: 'ms-a',
      profileInputs: INPUTS,
    });
    expect(source.mediaSourceId).toBe('ms-a');
    expect(source.playMethod).toBe('Transcode');
    expect(source.url).toBe('http://srv/x.m3u8');
  });
});

describe('resolvePlayback（转码分支，M3）', () => {
  it('TranscodingUrl 仅拼 baseUrl、不增删参数；playMethod=Transcode；maxResolutionTier 随源记录', async () => {
    const { adapter } = makeAdapter('EMBY', TRANSCODE_RESPONSE);
    const source = await adapter.resolvePlayback('u1', 'item1', {
      maxResolutionTier: 'SD',
      profileInputs: INPUTS,
    });
    expect(source.playMethod).toBe('Transcode');
    expect(source.url).toBe(
      'http://srv/videos/ms-9/hls1/main.m3u8?DeviceId=d1&MediaSourceId=ms-9&PlaySessionId=ps-t1&api_key=srvkey'
    );
    expect(source.maxResolutionTier).toBe('SD');
    expect(source.sourceWidth).toBe(1920);
    expect(source.sourceHeight).toBe(1080);
    expect(source.positionMsAtStart).toBe(0);
    expect(source.runTimeMs).toBe(600_000);
  });

  it('MediaStreams 翻译：audioList/subtitleList；DeliveryMethod 三态（External/Encode/缺省）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', TRANSCODE_RESPONSE);
    const source = await adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS });
    // 音轨
    expect(source.audioList).toEqual([
      { streamIndex: 1, language: 'jpn', title: '日语 5.1', codec: 'flac', channels: 6, isDefault: true },
      { streamIndex: 2, language: 'eng', title: '评论音轨', codec: 'aac', channels: 2, isDefault: undefined },
    ]);
    // 字幕：burnIn=Encode、isExternal=External、缺省两者皆否
    expect(source.subtitleList).toHaveLength(3);
    const srt = source.subtitleList[0];
    expect(srt).toMatchObject({ streamIndex: 3, language: 'chi', title: '简体中文', format: 'srt', isExternal: true, isDefault: true, burnIn: false });
    expect(srt.vttUrl).toBe('http://srv/Videos/i1/ms-9/Subtitles/3/Stream.vtt?api_key=srvkey');
    const ass = source.subtitleList[1];
    expect(ass).toMatchObject({ streamIndex: 4, title: '特效字幕', format: 'ass', burnIn: true, isExternal: false });
    expect(ass.vttUrl).toBeUndefined(); // 烧录轨不产出 vttUrl
    const noDelivery = source.subtitleList[2];
    expect(noDelivery).toMatchObject({ streamIndex: 5, isExternal: false, burnIn: false });
    // 缺省 title 不下发（UI 层按当前语言生成「字幕 N」兜底）
    expect(noDelivery.title).toBeUndefined();
  });

  it('vttUrl：DeliveryUrl 缺 api_key 时补齐（不重复追加）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      PlaySessionId: 'ps-v',
      MediaSources: [
        {
          Id: 'ms-v',
          SupportsDirectPlay: true,
          MediaStreams: [
            {
              Index: 2,
              Type: 'Subtitle',
              Codec: 'srt',
              DeliveryMethod: 'External',
              DeliveryUrl: '/Videos/i1/ms-v/Subtitles/2/Stream.vtt?lang=chi',
            },
          ],
        },
      ],
    });
    const source = await adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS });
    expect(source.subtitleList[0]?.vttUrl).toBe(
      'http://srv/Videos/i1/ms-v/Subtitles/2/Stream.vtt?lang=chi&api_key=tok'
    );
  });

  it('vttUrl：DeliveryUrl 缺省走 buildSubtitleUrl 兜底（恒含 api_key）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', {
      PlaySessionId: 'ps-w',
      MediaSources: [
        {
          Id: 'ms-w',
          SupportsDirectPlay: true,
          MediaStreams: [
            { Index: 1, Type: 'Subtitle', Codec: 'srt', DeliveryMethod: 'External' },
          ],
        },
      ],
    });
    const source = await adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS });
    expect(source.subtitleList[0]?.vttUrl).toBe(
      'http://srv/Videos/item1/ms-w/Subtitles/1/Stream.vtt?api_key=tok'
    );
  });

  it('SupportsTranscoding=true 但 TranscodingUrl 为空（异常服务器）→ PLAYBACK_UNSUPPORTED', async () => {
    const { adapter } = makeAdapter('EMBY', {
      PlaySessionId: 'ps-x',
      MediaSources: [{ Id: 'ms-x', SupportsDirectPlay: false, SupportsTranscoding: true }],
    });
    await expect(
      adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS })
    ).rejects.toMatchObject({ code: 'PLAYBACK_UNSUPPORTED' });
  });

  it('两者皆否（含服务器无转码器的罕见场景）→ PLAYBACK_UNSUPPORTED', async () => {
    const { adapter } = makeAdapter('EMBY', {
      PlaySessionId: 'ps-3',
      MediaSources: [{ Id: 'ms-c', Container: 'mkv', SupportsDirectPlay: false, SupportsTranscoding: false }],
    });
    await expect(
      adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS })
    ).rejects.toMatchObject({ code: 'PLAYBACK_UNSUPPORTED' });
  });

  it('空 MediaSources 响应 → PLAYBACK_UNSUPPORTED（不崩溃）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', { PlaySessionId: 'ps-4', MediaSources: [] });
    await expect(
      adapter.resolvePlayback('u1', 'item1', { profileInputs: INPUTS })
    ).rejects.toMatchObject({ code: 'PLAYBACK_UNSUPPORTED' });
  });
});

describe('buildSubtitleUrl（外挂 vtt，双端共享，03 §4.5.2）', () => {
  it('双实例路径一致：/Videos/{itemId}/{msId}/Subtitles/{index}/Stream.vtt?api_key=', () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter } = makeAdapter(flavor);
      expect(adapter.buildSubtitleUrl('item1', 'ms-1', 3)).toBe(
        'http://srv/Videos/item1/ms-1/Subtitles/3/Stream.vtt?api_key=tok'
      );
    }
  });
});

describe('report 三方法（Playing/Progress/Stopped）', () => {
  const BASE_ARGS: ReportArgs = {
    itemId: 'item1',
    playSessionId: 'ps-1',
    mediaSourceId: 'ms-1',
    positionMs: 30_000,
    playMethod: 'DirectPlay',
  };

  it('双实例路径：/Sessions/Playing 与 /Sessions/Playing/Progress、/Sessions/Stopped', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.reportPlaying(BASE_ARGS);
      await adapter.reportProgress({ ...BASE_ARGS, isPaused: true });
      await adapter.reportStopped(BASE_ARGS);
      const urls = api.request.mock.calls.map((call) => call[0].url as string);
      expect(urls[0]).toBe('http://srv/Sessions/Playing');
      expect(urls[1]).toBe('http://srv/Sessions/Playing/Progress');
      expect(urls[2]).toBe('http://srv/Sessions/Stopped');
      expect(api.request.mock.calls.every((call) => call[0].method === 'POST')).toBe(true);
    }
  });

  it('body：PositionTicks = msToTicks(positionMs)、IsPaused 仅 Progress 携带、PlayMethod 直传', async () => {
    const { adapter, api } = makeAdapter('EMBY');
    await adapter.reportPlaying(BASE_ARGS);
    await adapter.reportProgress({ ...BASE_ARGS, isPaused: true });
    await adapter.reportStopped(BASE_ARGS);
    const [playingBody, progressBody, stoppedBody] = api.request.mock.calls.map(
      (call) => call[0].body
    );
    expect(playingBody).toEqual({
      ItemId: 'item1',
      PlaySessionId: 'ps-1',
      MediaSourceId: 'ms-1',
      PositionTicks: 300_000_000, // 30s × 10000
      PlayMethod: 'DirectPlay',
    });
    expect(progressBody).toMatchObject({ PositionTicks: 300_000_000, IsPaused: true });
    expect(stoppedBody).toEqual(playingBody); // Stopped body 同 Playing（不带 IsPaused）
  });
});

describe('markPlayed / unmarkPlayed（成对式，02 §4.3）', () => {
  it('双实例：POST 与 DELETE 路径', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor);
      await adapter.markPlayed('u1', 'item1');
      await adapter.unmarkPlayed('u1', 'item1');
      expect(api.request.mock.calls[0]).toMatchObject([
        { method: 'POST', url: 'http://srv/Users/u1/PlayedItems/item1' },
      ]);
      expect(api.request.mock.calls[1]).toMatchObject([
        { method: 'DELETE', url: 'http://srv/Users/u1/PlayedItems/item1' },
      ]);
    }
  });
});
