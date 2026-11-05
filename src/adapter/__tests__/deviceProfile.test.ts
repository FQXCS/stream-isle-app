/**
 * DeviceProfileBuilder 单测：分辨率档位 × 能力 × 开关矩阵、SubtitleProfiles/TranscodingProfiles
 * 恒定值、全能力机型产出（03 §4.4.2 逐字断言）。
 */
import {
  buildDeviceProfile,
  type DecoderCapabilities,
} from '@/adapter/DeviceProfileBuilder';
import { RESOLUTION_TIER_MAP } from '@/constant/resolution';

/** 能力快捷构造（缺省全 false） */
function caps(overrides: Partial<DecoderCapabilities> = {}): DecoderCapabilities {
  return { supportsHevcMain10: false, supportsVp9: false, supportsAv1: false, ...overrides };
}

/** 全能力机型（探测全真）+ 开关开 */
const ALL_CAPS = caps({ supportsHevcMain10: true, supportsVp9: true, supportsAv1: true });

describe('buildDeviceProfile', () => {
  it('档位 → MaxStreamingBitrate 取档位内置上限；分辨率档输出 MaxWidth/MaxHeight', () => {
    for (const tier of Object.values(RESOLUTION_TIER_MAP)) {
      const profile = buildDeviceProfile({
        maxResolutionTier: tier.key,
        allowHevcDirectPlay: true,
        decoderCaps: ALL_CAPS,
      });
      expect(profile.MaxStreamingBitrate).toBe(tier.bitrateBps);
      const transcode = profile.TranscodingProfiles[0];
      if (tier.maxHeight > 0) {
        expect(transcode.MaxWidth).toBe(tier.maxWidth);
        expect(transcode.MaxHeight).toBe(tier.maxHeight);
      } else {
        expect(transcode.MaxWidth).toBeUndefined();
        expect(transcode.MaxHeight).toBeUndefined();
      }
    }
    // 明确断言档位数值（无限制 60M / 4K 40M / 1080p 20M / 720p 10M / 480p 4M）
    expect(RESOLUTION_TIER_MAP.UNLIMITED.bitrateBps).toBe(60_000_000);
    expect(RESOLUTION_TIER_MAP.UHD.bitrateBps).toBe(40_000_000);
    expect(RESOLUTION_TIER_MAP.FHD.bitrateBps).toBe(20_000_000);
    expect(RESOLUTION_TIER_MAP.HD.bitrateBps).toBe(10_000_000);
    expect(RESOLUTION_TIER_MAP.SD.bitrateBps).toBe(4_000_000);
  });

  it('1080p 档 → 转码档 MaxWidth=1920 / MaxHeight=1080', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'FHD',
      allowHevcDirectPlay: true,
      decoderCaps: caps(),
    });
    expect(profile.TranscodingProfiles[0]).toMatchObject({ MaxWidth: 1920, MaxHeight: 1080 });
  });

  it('无限制档 → 转码档不带分辨率上限', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: true,
      decoderCaps: caps(),
    });
    expect(profile.TranscodingProfiles[0]).toEqual({
      Container: 'ts',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac',
      Protocol: 'hls',
    });
  });

  it('Main10=false → VideoCodec 不含 hevc（8bit-only 机型让 10bit 片转码，T1 机制）', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: true,
      decoderCaps: caps({ supportsVp9: true }),
    });
    expect(profile.DirectPlayProfiles[0]?.VideoCodec).toBe('h264,vp9');
  });

  it('开关关（即使 Main10=true）→ 不含 hevc', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: false,
      decoderCaps: caps({ supportsHevcMain10: true }),
    });
    expect(profile.DirectPlayProfiles[0]?.VideoCodec).toBe('h264');
  });

  it('Main10=true 且开关开 → 含 hevc；vp9/av1 按探测结果拼接', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: true,
      decoderCaps: caps({ supportsHevcMain10: true, supportsAv1: true }),
    });
    expect(profile.DirectPlayProfiles[0]?.VideoCodec).toBe('h264,hevc,av1');
  });

  it('DirectPlayProfiles 容器/音频编解码恒定；仅一条', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: true,
      decoderCaps: ALL_CAPS,
    });
    expect(profile.DirectPlayProfiles).toHaveLength(1);
    expect(profile.DirectPlayProfiles[0]).toMatchObject({
      Container: 'mp4,mkv,mov,m4v',
      Type: 'Video',
      AudioCodec: 'aac,mp3,ac3,eac3,flac,opus',
    });
  });

  it('SubtitleProfiles 恒定（字幕策略矩阵）', () => {
    const profile = buildDeviceProfile({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: true,
      decoderCaps: caps(),
    });
    expect(profile.SubtitleProfiles).toEqual([
      { Format: 'vtt', Method: 'External' },
      { Format: 'srt', Method: 'External' },
      { Format: 'ass', Method: 'Encode' },
      { Format: 'pgs', Method: 'Encode' },
      { Format: 'sub', Method: 'Encode' },
    ]);
  });

  it('全能力机型（探测全真+开关开+无限制）产出', () => {
    expect(
      buildDeviceProfile({
        maxResolutionTier: 'UNLIMITED',
        allowHevcDirectPlay: true,
        decoderCaps: ALL_CAPS,
      })
    ).toEqual({
      MaxStreamingBitrate: 60000000,
      DirectPlayProfiles: [
        {
          Container: 'mp4,mkv,mov,m4v',
          Type: 'Video',
          VideoCodec: 'h264,hevc,vp9,av1',
          AudioCodec: 'aac,mp3,ac3,eac3,flac,opus',
        },
      ],
      TranscodingProfiles: [
        { Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac', Protocol: 'hls' },
      ],
      SubtitleProfiles: [
        { Format: 'vtt', Method: 'External' },
        { Format: 'srt', Method: 'External' },
        { Format: 'ass', Method: 'Encode' },
        { Format: 'pgs', Method: 'Encode' },
        { Format: 'sub', Method: 'Encode' },
      ],
    });
  });

  it('每次调用返回新对象（无共享可变状态）', () => {
    const opts = {
      maxResolutionTier: 'UNLIMITED' as const,
      allowHevcDirectPlay: true,
      decoderCaps: caps(),
    };
    expect(buildDeviceProfile(opts)).not.toBe(buildDeviceProfile(opts));
  });
});
