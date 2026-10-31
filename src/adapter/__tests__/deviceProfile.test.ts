/**
 * DeviceProfileBuilder 单测（M3 文档 §6.1 DeviceProfileBuilder 行）：
 * 档位×能力×开关矩阵、SubtitleProfiles/TranscodingProfiles 恒定值、
 * 全能力机型产出 = 设计文档 §8.2 JSON（03 §4.4.2 逐字断言）。
 */
import {
  buildDeviceProfile,
  type DecoderCapabilities,
} from '@/adapter/DeviceProfileBuilder';
import { BITRATE_TIER_MAP } from '@/constant/bitrate';

/** 能力快捷构造（缺省全 false） */
function caps(overrides: Partial<DecoderCapabilities> = {}): DecoderCapabilities {
  return { supportsHevcMain10: false, supportsVp9: false, supportsAv1: false, ...overrides };
}

/** 全能力机型（探测全真）+ 开关开：产出应与设计文档 §8.2 静态 JSON 逐字一致 */
const ALL_CAPS = caps({ supportsHevcMain10: true, supportsVp9: true, supportsAv1: true });

describe('buildDeviceProfile（M3 完整版）', () => {
  it('四档位 → MaxStreamingBitrate 取档位表值', () => {
    for (const tier of Object.values(BITRATE_TIER_MAP)) {
      const profile = buildDeviceProfile({
        maxBitrateBps: tier.bitrateBps,
        allowHevcDirectPlay: true,
        decoderCaps: ALL_CAPS,
      });
      expect(profile.MaxStreamingBitrate).toBe(tier.bitrateBps);
    }
    // 明确断言四档数值（自动 20M / 10 / 4 / 2M，设计文档 §8.2/§8.3）
    expect(BITRATE_TIER_MAP.AUTO.bitrateBps).toBe(20_000_000);
    expect(BITRATE_TIER_MAP.HIGH.bitrateBps).toBe(10_000_000);
    expect(BITRATE_TIER_MAP.MEDIUM.bitrateBps).toBe(4_000_000);
    expect(BITRATE_TIER_MAP.LOW.bitrateBps).toBe(2_000_000);
  });

  it('Main10=false → VideoCodec 不含 hevc（8bit-only 机型让 10bit 片转码，T1 机制）', () => {
    const profile = buildDeviceProfile({
      maxBitrateBps: 20_000_000,
      allowHevcDirectPlay: true,
      decoderCaps: caps({ supportsVp9: true }),
    });
    expect(profile.DirectPlayProfiles[0]?.VideoCodec).toBe('h264,vp9');
  });

  it('开关关（即使 Main10=true）→ 不含 hevc', () => {
    const profile = buildDeviceProfile({
      maxBitrateBps: 20_000_000,
      allowHevcDirectPlay: false,
      decoderCaps: caps({ supportsHevcMain10: true }),
    });
    expect(profile.DirectPlayProfiles[0]?.VideoCodec).toBe('h264');
  });

  it('Main10=true 且开关开 → 含 hevc；vp9/av1 按探测结果拼接', () => {
    const profile = buildDeviceProfile({
      maxBitrateBps: 20_000_000,
      allowHevcDirectPlay: true,
      decoderCaps: caps({ supportsHevcMain10: true, supportsAv1: true }),
    });
    expect(profile.DirectPlayProfiles[0]?.VideoCodec).toBe('h264,hevc,av1');
  });

  it('DirectPlayProfiles 容器/音频编解码恒定；仅一条', () => {
    const profile = buildDeviceProfile({
      maxBitrateBps: 20_000_000,
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

  it('TranscodingProfiles 恒定（ts/h264/aac/hls）', () => {
    const profile = buildDeviceProfile({
      maxBitrateBps: 4_000_000,
      allowHevcDirectPlay: false,
      decoderCaps: caps(),
    });
    expect(profile.TranscodingProfiles).toEqual([
      { Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac', Protocol: 'hls' },
    ]);
  });

  it('SubtitleProfiles 恒定（字幕策略矩阵，与设计文档 §8.2 JSON 逐字一致）', () => {
    const profile = buildDeviceProfile({
      maxBitrateBps: 20_000_000,
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

  it('全能力机型（探测全真+开关开）产出 = 设计文档 §8.2 静态 JSON', () => {
    expect(
      buildDeviceProfile({
        maxBitrateBps: 20_000_000,
        allowHevcDirectPlay: true,
        decoderCaps: ALL_CAPS,
      })
    ).toEqual({
      MaxStreamingBitrate: 20000000,
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
    const opts = { maxBitrateBps: 20_000_000, allowHevcDirectPlay: true, decoderCaps: caps() };
    expect(buildDeviceProfile(opts)).not.toBe(buildDeviceProfile(opts));
  });
});
