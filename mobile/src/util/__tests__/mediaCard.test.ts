/**
 * 媒体卡图幅单测（媒体库融合页每库行）：图幅跟随条目类型，
 * 海报 2:3 / 视频帧 16:9 / 专辑相册 1:1（Emby Web 同口径）。
 */
import { cardAspectRatioOf } from '@/util/mediaCard';

describe('cardAspectRatioOf', () => {
  it('电影/剧集/图书为 2:3 海报', () => {
    expect(cardAspectRatioOf('Movie')).toBeCloseTo(2 / 3);
    expect(cardAspectRatioOf('Series')).toBeCloseTo(2 / 3);
    expect(cardAspectRatioOf('Book')).toBeCloseTo(2 / 3);
  });

  it('单集/家庭视频/预告片/音乐视频为 16:9 视频帧', () => {
    expect(cardAspectRatioOf('Episode')).toBeCloseTo(16 / 9);
    expect(cardAspectRatioOf('Video')).toBeCloseTo(16 / 9);
    expect(cardAspectRatioOf('Trailer')).toBeCloseTo(16 / 9);
    expect(cardAspectRatioOf('MusicVideo')).toBeCloseTo(16 / 9);
  });

  it('专辑/歌曲/相册/照片为 1:1 方形', () => {
    expect(cardAspectRatioOf('MusicAlbum')).toBe(1);
    expect(cardAspectRatioOf('Audio')).toBe(1);
    expect(cardAspectRatioOf('PhotoAlbum')).toBe(1);
    expect(cardAspectRatioOf('Photo')).toBe(1);
  });
});
