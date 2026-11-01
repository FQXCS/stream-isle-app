/**
 * 排序菜单分组单测：非音频按条目类型只保留实测有效的排序字段，
 * 音频使用 Emby 音乐词表（专辑/专辑艺人），组内顺序沿用 SORT_OPTIONS 相对顺序。
 */
import {
  ARTIST_SORT_OPTIONS,
  AUDIO_SORT_OPTIONS,
  BOOK_SORT_OPTIONS,
  FOLDER_SORT_OPTIONS,
  PHOTO_SORT_OPTIONS,
  SORT_OPTIONS,
} from '@/constant/browse';

function valuesOf(optionList: readonly { value: string }[]): string[] {
  return optionList.map((option) => option.value);
}

describe('排序菜单分组（按条目类型过滤）', () => {
  it('视频类保持十三项原顺序', () => {
    expect(valuesOf(SORT_OPTIONS)).toEqual([
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'COMMUNITY_RATING',
      'CRITIC_RATING',
      'OFFICIAL_RATING',
      'PLAY_COUNT',
      'DATE_PLAYED',
      'FILENAME',
      'RUNTIME',
      'FILE_SIZE',
      'CONTAINER',
      'RANDOM',
    ]);
  });

  it('音频十二项：专辑/专辑艺人紧跟标题，其余沿用现有相对顺序', () => {
    expect(valuesOf(AUDIO_SORT_OPTIONS)).toEqual([
      'SORT_NAME',
      'ALBUM',
      'ALBUM_ARTIST',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'PLAY_COUNT',
      'DATE_PLAYED',
      'FILENAME',
      'RUNTIME',
      'FILE_SIZE',
      'CONTAINER',
      'RANDOM',
    ]);
  });

  it('书库/照片/文件夹/艺人只保留有效字段', () => {
    expect(valuesOf(BOOK_SORT_OPTIONS)).toEqual([
      'SORT_NAME',
      'DATE_CREATED',
      'PLAY_COUNT',
      'DATE_PLAYED',
      'FILENAME',
    ]);
    expect(valuesOf(PHOTO_SORT_OPTIONS)).toEqual([
      'SORT_NAME',
      'DATE_CREATED',
      'PREMIERE_DATE',
      'FILENAME',
      'CONTAINER',
      'RANDOM',
    ]);
    expect(valuesOf(FOLDER_SORT_OPTIONS)).toEqual([
      'SORT_NAME',
      'DATE_CREATED',
      'FILENAME',
      'RANDOM',
    ]);
    expect(valuesOf(ARTIST_SORT_OPTIONS)).toEqual(['SORT_NAME', 'DATE_CREATED', 'RANDOM']);
  });
});
