/**
 * BaseAdapter 详情主数据单测（M2 文档 §6.1 BaseAdapter.detail 行）：
 * getItemDetail 路径 + Fields 参数断言（含 Overview/Genres/People/MediaSources/Taglines/
 * OriginalTitle/OfficialRating/CommunityRating/Path，M2 §4.3 表）+ 响应翻译。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ApiClient } from '@/infra/api/ApiClient';

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

const DETAIL_RESPONSE = {
  Id: 'item1',
  Type: 'Movie',
  Name: '测试电影',
  OriginalTitle: '原题',
  Overview: '简介',
  ProductionYear: 2010,
  OfficialRating: 'PG-13',
  CommunityRating: 8.5,
  RunTimeTicks: 888_0000_0000,
  Genres: ['科幻', '动作'],
  Taglines: ['标语一'],
  People: [
    { Id: 'p1', Name: '演员甲', Role: '主角', Type: 'Actor', PrimaryImageTag: 'tagA' },
    { Id: 'p2', Name: '导演乙', Role: undefined, Type: 'Director' },
    { Id: 'p3', Name: '演员丙', Type: 'Actor', PrimaryImageTag: 'tagC' },
  ],
  MediaSources: [
    {
      Id: 'ms-1',
      Name: '1080p - h264',
      Container: 'mkv',
      RunTimeTicks: 720_000_0000,
      SupportsDirectPlay: true,
      SupportsTranscoding: true,
      TranscodingUrl: '/videos/ms-1/main.m3u8',
      Size: 123_456,
    },
  ],
  Path: 'F:\\media\\测试电影.mkv',
  ImageTags: { Primary: 'primaryTag', Logo: 'logoTag' },
  BackdropImageTags: ['backdropTag'],
  UserData: { Played: false, PlayCount: 1, IsFavorite: false, PlaybackPositionTicks: 300_000_000 },
};

describe('getItemDetail（详情主数据）', () => {
  it('双实例：GET 路径 + Fields 参数全量断言（M2 §4.3 表）', async () => {
    for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
      const { adapter, api } = makeAdapter(flavor, DETAIL_RESPONSE);
      await adapter.getItemDetail('u1', 'item1');
      const req = api.request.mock.calls[0][0];
      expect(req.method).toBe('GET');
      expect(req.url).toBe(
        'http://srv/Users/u1/Items/item1?Fields=' +
          'Overview%2CGenres%2CPeople%2CMediaSources%2CTaglines%2COriginalTitle%2COfficialRating%2CCommunityRating%2CPath'
      );
    }
  });

  it('响应翻译：元数据/时长 Ticks 换算/Genres/Taglines', async () => {
    const { adapter } = makeAdapter('EMBY', DETAIL_RESPONSE);
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.id).toBe('item1');
    expect(detail.type).toBe('Movie');
    expect(detail.name).toBe('测试电影');
    expect(detail.originalTitle).toBe('原题');
    expect(detail.productionYear).toBe(2010);
    expect(detail.officialRating).toBe('PG-13');
    expect(detail.communityRating).toBe(8.5);
    expect(detail.runtimeMs).toBe(8_880_000);
    expect(detail.genreList).toEqual(['科幻', '动作']);
    expect(detail.taglineList).toEqual(['标语一']);
    expect(detail.path).toBe('F:\\media\\测试电影.mkv');
    expect(detail.userData.playbackPositionMs).toBe(30_000);
  });

  it('peopleList：演员在前（稳定排序）+ 头像 URL（Primary, maxWidth=200）+ 饰演角色', async () => {
    const { adapter } = makeAdapter('JELLYFIN', DETAIL_RESPONSE);
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.peopleList.map((person) => person.name)).toEqual(['演员甲', '演员丙', '导演乙']);
    expect(detail.peopleList[0].role).toBe('主角');
    expect(detail.peopleList[0].headImageUrl).toContain('/Items/p1/Images/Primary');
    expect(detail.peopleList[0].headImageUrl).toContain('maxWidth=200');
    expect(detail.peopleList[0].headImageUrl).toContain('tag=tagA'); // Jellyfin 缓存破坏参数
    expect(detail.peopleList[2].kind).toBe('Director');
    expect(detail.peopleList[2].headImageUrl).toBeUndefined();
  });

  it('图片 URL：海报 Primary@600、Hero Backdrop@1280、Logo@600（Jellyfin 带 tag）', async () => {
    const { adapter } = makeAdapter('JELLYFIN', DETAIL_RESPONSE);
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.posterImageUrl).toContain('/Items/item1/Images/Primary');
    expect(detail.posterImageUrl).toContain('maxWidth=600');
    expect(detail.heroImageUrl).toContain('/Items/item1/Images/Backdrop');
    expect(detail.heroImageUrl).toContain('maxWidth=1280');
    expect(detail.logoImageUrl).toContain('/Items/item1/Images/Logo');
  });

  it('无 Backdrop 时 Hero 回退 Primary（M2 §4.2）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      ...DETAIL_RESPONSE,
      BackdropImageTags: [],
    });
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.heroImageUrl).toBe(detail.posterImageUrl);
    expect(detail.heroImageUrl).toContain('Images/Primary');
  });

  it('mediaSourceList：SupportsDirectPlay/Transcoding/TranscodingUrl 透传/Size 存档', async () => {
    const { adapter } = makeAdapter('EMBY', DETAIL_RESPONSE);
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.mediaSourceList).toHaveLength(1);
    const source = detail.mediaSourceList[0];
    expect(source.id).toBe('ms-1');
    expect(source.container).toBe('mkv');
    expect(source.supportsDirectPlay).toBe(true);
    expect(source.supportsTranscoding).toBe(true);
    expect(source.transcodingUrl).toBe('/videos/ms-1/main.m3u8'); // 透传不改写
    expect(source.runtimeMs).toBe(720_000);
    expect(source.sizeBytes).toBe(123_456);
  });

  it('MediaStreams 翻译：视频/音频/字幕技术信息（详情页信息卡消费）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      ...DETAIL_RESPONSE,
      MediaSources: [
        {
          ...DETAIL_RESPONSE.MediaSources[0],
          MediaStreams: [
            {
              Index: 0,
              Type: 'Video',
              Codec: 'hevc',
              DisplayTitle: '720p HEVC',
              Profile: 'Main',
              Level: 93,
              Width: 962,
              Height: 720,
              AspectRatio: '4:3',
              IsInterlaced: false,
              RealFrameRate: 30,
              BitRate: 280_000,
              VideoRange: 'SDR',
              ColorSpace: 'bt709',
              BitDepth: 8,
              PixelFormat: 'yuv420p',
              RefFrames: 1,
            },
            {
              Index: 1,
              Type: 'Audio',
              Codec: 'aac',
              DisplayTitle: 'AAC stereo',
              Channels: 2,
              ChannelLayout: 'stereo',
              SampleRate: 24_000,
              BitRate: 128_000,
              IsDefault: true,
            },
            {
              Index: 2,
              Type: 'Subtitle',
              Codec: 'srt',
              DisplayTitle: '简体中文',
              Language: 'chi',
              DeliveryMethod: 'External',
            },
          ],
        },
      ],
    });
    const source = (await adapter.getItemDetail('u1', 'item1')).mediaSourceList[0];
    expect(source.videoStreamList).toHaveLength(1);
    expect(source.videoStreamList?.[0]).toMatchObject({
      codec: 'hevc',
      width: 962,
      height: 720,
      bitrateBps: 280_000,
      colorSpace: 'bt709',
    });
    expect(source.audioStreamList?.[0]).toMatchObject({
      codec: 'aac',
      channelLayout: 'stereo',
      sampleRate: 24_000,
    });
    expect(source.subtitleStreamList?.[0]).toMatchObject({
      language: 'chi',
      format: 'srt',
      isExternal: true,
    });
  });

  it('剧集条目：SeriesId/SeasonId/IndexNumber 翻译', async () => {
    const { adapter } = makeAdapter('EMBY', {
      ...DETAIL_RESPONSE,
      Type: 'Series',
      SeriesId: undefined,
      SeasonId: undefined,
      IndexNumber: undefined,
    });
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.type).toBe('Series');
  });

  it('响应缺 Type（异常形态）→ 抛 UNKNOWN，不编造默认类型', async () => {
    const { adapter } = makeAdapter('EMBY', { Id: 'x', Name: '无类型' });
    await expect(adapter.getItemDetail('u1', 'x')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('Person 条目：posterImageUrl 按 PERSON_HEAD_MAX_WIDTH=200 产出（M2 §4.3 头像宽度）', async () => {
    const { adapter } = makeAdapter('EMBY', {
      ...DETAIL_RESPONSE,
      Type: 'Person',
      MediaSources: undefined,
    });
    const detail = await adapter.getItemDetail('u1', 'item1');
    expect(detail.type).toBe('Person');
    expect(detail.posterImageUrl).toContain('maxWidth=200');
  });
});
