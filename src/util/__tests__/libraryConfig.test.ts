/**
 * 库页配置解析单测：默认顺序 = 目录；override 原样保序；未知项丢弃；
 * Tab 上限 5；排序按 flavor 过滤不支持字段。
 */
import type { LibraryTypeEnum } from '@/adapter/model';
import { SORT_OPTIONS } from '@/constant/browse';
import { TAB_CATALOG, type TabId, type TabSpec } from '@/constant/libraryTabs';
import { SORT_SETS } from '@/constant/sortCatalog';
import {
  resolveDefaultTabId,
  resolveTabList,
  resolveTabSortOptions,
  tabScopeKeyOf,
  tabSortScopeKeyOf,
} from '@/util/libraryConfig';

function tabOf(libraryType: LibraryTypeEnum, tabId: TabId): TabSpec {
  const tab = TAB_CATALOG[libraryType].find((item) => item.id === tabId);
  if (tab === undefined) {
    throw new Error(`测试目录缺少 ${libraryType}.${tabId}`);
  }
  return tab;
}

function valuesOf(optionList: readonly { value: string }[]): string[] {
  return optionList.map((option) => option.value);
}

describe('resolveTabList', () => {
  it('电影库默认 = 影片/收藏/未看/文件夹（现状）', () => {
    const tabList = resolveTabList({ flavor: 'EMBY', libraryType: 'MOVIE' });
    expect(tabList.map((tab) => tab.id)).toEqual(['all', 'favorite', 'unplayed', 'folder']);
  });

  it('override 顺序原样保留，不被目录顺序重排', () => {
    const tabList = resolveTabList({
      flavor: 'EMBY',
      libraryType: 'MOVIE',
      tabOverrides: { 'EMBY:MOVIE': ['folder', 'all'] },
    });
    expect(tabList.map((tab) => tab.id)).toEqual(['folder', 'all']);
  });

  it('未知 id 丢弃、重复 id 去重、超过 5 个截断', () => {
    const tabList = resolveTabList({
      flavor: 'EMBY',
      libraryType: 'MOVIE',
      tabOverrides: {
        'EMBY:MOVIE': ['trailer', 'unknown', 'trailer', 'all', 'favorite', 'unplayed', 'folder'],
      },
    });
    expect(tabList.map((tab) => tab.id)).toEqual([
      'trailer',
      'all',
      'favorite',
      'unplayed',
      'folder',
    ]);
  });

  it('空 override / 全部未知 id 回退默认', () => {
    expect(
      resolveTabList({ flavor: 'EMBY', libraryType: 'MOVIE', tabOverrides: { 'EMBY:MOVIE': [] } }).map(
        (tab) => tab.id
      )
    ).toEqual(['all', 'favorite', 'unplayed', 'folder']);
    expect(
      resolveTabList({
        flavor: 'EMBY',
        libraryType: 'MOVIE',
        tabOverrides: { 'EMBY:MOVIE': ['unknown-only'] },
      }).map((tab) => tab.id)
    ).toEqual(['all', 'favorite', 'unplayed', 'folder']);
  });

  it('flavor 隔离：Jellyfin 看不到 Emby 专属 Tab，且音乐 played 不出现', () => {
    const jellyfinMusic = resolveTabList({ flavor: 'JELLYFIN', libraryType: 'MUSIC' });
    expect(jellyfinMusic.map((tab) => tab.id)).not.toContain('played');
    const jellyfinOverride = resolveTabList({
      flavor: 'JELLYFIN',
      libraryType: 'MUSIC',
      tabOverrides: { 'JELLYFIN:MUSIC': ['played', 'song'] },
    });
    expect(jellyfinOverride.map((tab) => tab.id)).toEqual(['song']);
  });

  it('默认选中：电影=影片，照片=图片', () => {
    expect(resolveDefaultTabId(resolveTabList({ flavor: 'EMBY', libraryType: 'MOVIE' }))).toBe('all');
    expect(resolveDefaultTabId(resolveTabList({ flavor: 'EMBY', libraryType: 'PHOTO' }))).toBe(
      'photo'
    );
  });
});

describe('resolveTabSortOptions', () => {
  it('电影影片（Emby）默认 = 现有 13 项顺序', () => {
    const optionList = resolveTabSortOptions({
      flavor: 'EMBY',
      libraryType: 'MOVIE',
      tab: tabOf('MOVIE', 'all'),
    });
    expect(valuesOf(optionList)).toEqual(valuesOf(SORT_OPTIONS));
  });

  it('电影影片（Jellyfin）默认隐藏 Filename/Size/Container', () => {
    const optionList = resolveTabSortOptions({
      flavor: 'JELLYFIN',
      libraryType: 'MOVIE',
      tab: tabOf('MOVIE', 'all'),
    });
    const values = valuesOf(optionList);
    expect(values).not.toContain('FILENAME');
    expect(values).not.toContain('FILE_SIZE');
    expect(values).not.toContain('CONTAINER');
    expect(values).toHaveLength(10);
    expect(values[0]).toBe('SORT_NAME');
  });

  it('override 顺序原样保留（拖动排序生效）', () => {
    const optionList = resolveTabSortOptions({
      flavor: 'EMBY',
      libraryType: 'MOVIE',
      tab: tabOf('MOVIE', 'all'),
      sortOverrides: { 'EMBY:MOVIE:all': ['RANDOM', 'DATE_CREATED', 'SORT_NAME'] },
    });
    expect(valuesOf(optionList)).toEqual(['RANDOM', 'DATE_CREATED', 'SORT_NAME']);
  });

  it('override 中不支持的字段被过滤；全被过滤时回退默认', () => {
    const filtered = resolveTabSortOptions({
      flavor: 'JELLYFIN',
      libraryType: 'MOVIE',
      tab: tabOf('MOVIE', 'all'),
      sortOverrides: { 'JELLYFIN:MOVIE:all': ['FILENAME', 'RANDOM', 'SORT_NAME'] },
    });
    expect(valuesOf(filtered)).toEqual(['RANDOM', 'SORT_NAME']);

    const fallback = resolveTabSortOptions({
      flavor: 'JELLYFIN',
      libraryType: 'MOVIE',
      tab: tabOf('MOVIE', 'all'),
      sortOverrides: { 'JELLYFIN:MOVIE:all': ['FILENAME', 'FILE_SIZE'] },
    });
    expect(valuesOf(fallback)).toEqual(
      valuesOf(SORT_OPTIONS).filter(
        (value) => value !== 'FILENAME' && value !== 'FILE_SIZE' && value !== 'CONTAINER'
      )
    );
  });

  it('剧集（Jellyfin）默认不含 Filename/Size/Container，新字段可按覆盖启用', () => {
    const values = valuesOf(
      resolveTabSortOptions({
        flavor: 'JELLYFIN',
        libraryType: 'TVSHOW',
        tab: tabOf('TVSHOW', 'all'),
      })
    );
    expect(values).not.toContain('FILENAME');
    expect(values).not.toContain('FILE_SIZE');
    expect(values).not.toContain('CONTAINER');
    expect(values).not.toContain('SERIES_DATE_PLAYED');

    const withSeriesDatePlayed = valuesOf(
      resolveTabSortOptions({
        flavor: 'JELLYFIN',
        libraryType: 'TVSHOW',
        tab: tabOf('TVSHOW', 'all'),
        sortOverrides: { 'JELLYFIN:TVSHOW:all': ['SERIES_DATE_PLAYED'] },
      })
    );
    expect(withSeriesDatePlayed).toEqual(['SERIES_DATE_PLAYED']);
  });

  it('文件夹排序：Emby 有文件名，Jellyfin 没有', () => {
    const embyValues = valuesOf(
      resolveTabSortOptions({
        flavor: 'EMBY',
        libraryType: 'MOVIE',
        tab: tabOf('MOVIE', 'folder'),
      })
    );
    const jellyfinValues = valuesOf(
      resolveTabSortOptions({
        flavor: 'JELLYFIN',
        libraryType: 'MOVIE',
        tab: tabOf('MOVIE', 'folder'),
      })
    );
    expect(embyValues).toContain('FILENAME');
    expect(jellyfinValues).not.toContain('FILENAME');
  });

  it('sortSet=none 返回空（SortMenu 隐藏）', () => {
    const optionList = resolveTabSortOptions({
      flavor: 'EMBY',
      libraryType: 'MOVIE',
      tab: tabOf('MOVIE', 'genre'),
    });
    expect(optionList).toEqual([]);
  });

  it('排序目录新增字段可按文档提供（导演/分辨率/帧率）', () => {
    expect(SORT_SETS.videoFull.available).toEqual(
      expect.arrayContaining(['DIRECTOR', 'RESOLUTION', 'FRAMERATE'])
    );
  });
});

describe('scope key helpers', () => {
  it('Tab/排序 scope key 格式固定', () => {
    expect(tabScopeKeyOf('EMBY', 'MOVIE')).toBe('EMBY:MOVIE');
    expect(tabSortScopeKeyOf('JELLYFIN', 'TVSHOW', 'all')).toBe('JELLYFIN:TVSHOW:all');
  });
});
