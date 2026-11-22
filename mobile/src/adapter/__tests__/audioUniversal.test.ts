/**
 * buildAudioUniversalUrl 单测（M5 文档 §6.1：参数全断言；设计文档 §8.4 明示两端参数构造须单测覆盖，
 * Jellyfin/Emby 双实例各跑一遍）。
 */
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import {
  AUDIO_TRANSCODING_AUDIO_CODEC,
  AUDIO_TRANSCODING_CONTAINER,
  UNIVERSAL_CONTAINER_LIST,
} from '@/constant/audio';
import { AUDIO_MAX_STREAMING_BITRATE_BPS } from '@/constant/bitrate';

const AUTO_BPS = AUDIO_MAX_STREAMING_BITRATE_BPS;

function make(flavor: 'JELLYFIN' | 'EMBY'): JellyfinAdapter | EmbyAdapter {
  const Ctor = flavor === 'JELLYFIN' ? JellyfinAdapter : EmbyAdapter;
  return new Ctor(
    { baseUrl: 'http://srv', flavor, token: 'tok' },
    { deviceId: 'dev-1', clientName: 'Stream Isle', appVersion: '0.1.0' }
  );
}

describe('buildAudioUniversalUrl（§8.4 统一端点，双实例）', () => {
  for (const flavor of ['JELLYFIN', 'EMBY'] as const) {
    it(`[${flavor}] 路径与参数全断言：DeviceId/api_key/PlaySessionId/MaxStreamingBitrate/Container/Transcoding*`, () => {
      const url = make(flavor).buildAudioUniversalUrl('itm1', 'ps-1');
      expect(url.startsWith('http://srv/Audio/itm1/universal?')).toBe(true);
      expect(url).toContain('DeviceId=dev-1');
      expect(url).toContain('api_key=tok');
      expect(url).toContain('PlaySessionId=ps-1');
      expect(url).toContain(`MaxStreamingBitrate=${AUTO_BPS}`);
      // 容器白名单逐项出现（URLSearchParams 将逗号编码为 %2C）
      expect(url).toContain(`Container=${encodeURIComponent(UNIVERSAL_CONTAINER_LIST)}`);
      expect(url).toContain(`TranscodingContainer=${AUDIO_TRANSCODING_CONTAINER}`);
      expect(url).toContain(`TranscodingAudioCodec=${AUDIO_TRANSCODING_AUDIO_CODEC}`);
    });

    it(`[${flavor}] 显式码率传入 MaxStreamingBitrate（调用方覆盖音频上限）`, () => {
      const url = make(flavor).buildAudioUniversalUrl('itm1', 'ps-1', 2_000_000);
      expect(url).toContain('MaxStreamingBitrate=2000000');
    });
  }
});
