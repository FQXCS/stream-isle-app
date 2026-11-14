/**
 * 起播默认字幕选轨单测（M3 §4.8.3 + M4 §4.5 匹配定稿）：
 * 语言经 normalizeSubtitleLang 归一化后等值比较（zh 轨 + chi 偏好命中——M4 定稿要修的
 * 前缀法漏判场景）、回退 isDefault/isForced、烧录轨与无 vttUrl 轨不参与、无命中不开字幕。
 */
import type { SubtitleTrack } from '@/adapter/model';
import { selectAutoSubtitleStreamIndex } from '@/util/subtitleSelect';

/** 构造外挂文本轨（vttUrl 已产出才参与自动选轨） */
function track(overrides: Partial<SubtitleTrack>): SubtitleTrack {
  return {
    streamIndex: 0,
    isExternal: true,
    burnIn: false,
    vttUrl: 'http://srv/sub.vtt?api_key=x',
    ...overrides,
  };
}

describe('selectAutoSubtitleStreamIndex（M4 §4.5 匹配定稿）', () => {
  it('zh 轨 + chi 偏好命中（归一化等值比较，前缀法漏判场景）', () => {
    const list = [track({ streamIndex: 2, language: 'zh' })];
    expect(selectAutoSubtitleStreamIndex(list, 'chi')).toBe(2);
  });

  it('Chinese/zho 形态轨 + chi 偏好命中；en/ja/ko 形态命中 eng/jpn/kor 偏好', () => {
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 1, language: 'Chinese' })], 'chi')).toBe(1);
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 1, language: 'zho' })], 'chi')).toBe(1);
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 3, language: 'en' })], 'eng')).toBe(3);
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 4, language: 'ja' })], 'jpn')).toBe(4);
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 5, language: 'ko' })], 'kor')).toBe(5);
  });

  it('三字码轨直配（chi 原样等值）；不同码（eng vs chi 偏好）不等值', () => {
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 2, language: 'chi' })], 'chi')).toBe(2);
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 2, language: 'eng' })], 'chi')).toBeNull();
  });

  it('语言不命中时回退 isDefault 轨', () => {
    const list = [
      track({ streamIndex: 1, language: 'fre' }),
      track({ streamIndex: 2, language: 'fre', isDefault: true }),
    ];
    expect(selectAutoSubtitleStreamIndex(list, 'chi')).toBe(2);
  });

  it('无 default 时回退 isForced 轨；全部无命中返回 null（不开启字幕）', () => {
    const list = [track({ streamIndex: 1, language: 'fre', isForced: true })];
    expect(selectAutoSubtitleStreamIndex(list, 'chi')).toBe(1);
    expect(selectAutoSubtitleStreamIndex([track({ streamIndex: 1, language: 'fre' })], 'chi')).toBeNull();
  });

  it('烧录轨与无 vttUrl 的轨不参与（避免高亮已选而画面无字幕）', () => {
    const list = [
      track({ streamIndex: 1, language: 'chi', burnIn: true }),
      track({ streamIndex: 2, language: 'chi', vttUrl: undefined }),
    ];
    expect(selectAutoSubtitleStreamIndex(list, 'chi')).toBeNull();
  });
});
