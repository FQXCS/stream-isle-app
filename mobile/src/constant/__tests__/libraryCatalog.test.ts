/**
 * Tab/排序目录完整性单测：14 类库都有默认项；默认不超过 5 个；
 * 每个排序集合的默认项必须可用，且每个可用项至少有一端能提供参数链。
 */
import type { LibraryTypeEnum, ServerFlavor } from '@/adapter/model';
import { COLLECTION_TYPE_MAP } from '@/constant/browse';
import {
  LIBRARY_TYPE_ORDER,
  MAX_LIBRARY_TABS,
  TAB_CATALOG,
  libraryTypesOfFlavor,
  tabsOfFlavor,
} from '@/constant/libraryTabs';
import { SORT_CHAIN, SORT_SETS } from '@/constant/sortCatalog';

const FLAVORS: readonly ServerFlavor[] = ['JELLYFIN', 'EMBY'];

describe('库页 Tab 目录', () => {
  it('14 类库均有目录条目且至少 1 个默认 Tab/默认选中项', () => {
    expect(LIBRARY_TYPE_ORDER).toHaveLength(14);
    for (const libraryType of LIBRARY_TYPE_ORDER) {
      const catalog = TAB_CATALOG[libraryType];
      expect(catalog.length).toBeGreaterThan(0);
      const defaultEnabled = catalog.filter((tab) => tab.defaultEnabled);
      expect(defaultEnabled.length).toBeGreaterThan(0);
      expect(defaultEnabled.length).toBeLessThanOrEqual(MAX_LIBRARY_TABS);
      expect(catalog.some((tab) => tab.defaultSelected)).toBe(true);
    }
  });

  it('默认选中的 Tab 必须同时默认启用', () => {
    for (const libraryType of LIBRARY_TYPE_ORDER) {
      for (const tab of TAB_CATALOG[libraryType]) {
        if (tab.defaultSelected) {
          expect(tab.defaultEnabled).toBe(true);
        }
      }
    }
  });

  it('同库类型内 Tab id 不重复；每个 Tab 至少有一个 flavor', () => {
    for (const libraryType of LIBRARY_TYPE_ORDER) {
      const ids = TAB_CATALOG[libraryType].map((tab) => tab.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const tab of TAB_CATALOG[libraryType]) {
        expect(tab.flavors.length).toBeGreaterThan(0);
      }
    }
  });

  it('所有非 none 的 sortSet 都存在；默认项必须属于可用集合', () => {
    for (const libraryType of LIBRARY_TYPE_ORDER) {
      for (const tab of TAB_CATALOG[libraryType]) {
        if (tab.sortSet === 'none') {
          continue;
        }
        const sortSet = SORT_SETS[tab.sortSet];
        expect(sortSet).toBeDefined();
        for (const value of sortSet.defaultChecked) {
          expect(sortSet.available).toContain(value);
        }
      }
    }
  });

  it('每个可用排序项至少有一端能提供参数链', () => {
    for (const sortSet of Object.values(SORT_SETS)) {
      for (const value of sortSet.available) {
        const providedByAnyFlavor = FLAVORS.some((flavor) => SORT_CHAIN[flavor][value] !== null);
        expect(providedByAnyFlavor).toBe(true);
      }
    }
  });

  it('Jellyfin 不出现 Emby 专属库类型，Emby 全量出现', () => {
    const jellyfinTypes = libraryTypesOfFlavor('JELLYFIN');
    expect(jellyfinTypes).not.toContain('AUDIOBOOK');
    expect(jellyfinTypes).not.toContain('GAME');
    expect(jellyfinTypes).not.toContain('CHANNEL');
    const embyTypes = libraryTypesOfFlavor('EMBY');
    for (const libraryType of LIBRARY_TYPE_ORDER) {
      expect(embyTypes).toContain(libraryType);
    }
  });

  it('tabsOfFlavor 只返回该 flavor 的 Tab', () => {
    const embyTabs = tabsOfFlavor('MOVIE', 'EMBY');
    const jellyfinTabs = tabsOfFlavor('MOVIE', 'JELLYFIN');
    expect(embyTabs).toEqual(jellyfinTabs);
    const jellyfinMusic = tabsOfFlavor('MUSIC', 'JELLYFIN').map((tab) => tab.id);
    const embyMusic = tabsOfFlavor('MUSIC', 'EMBY').map((tab) => tab.id);
    expect(jellyfinMusic).not.toContain('played');
    expect(embyMusic).toContain('played');
  });

  it('默认启用项按目录顺序排列（用于无覆盖的初始顺序）', () => {
    const movieDefaults = TAB_CATALOG.MOVIE.filter((tab) => tab.defaultEnabled).map(
      (tab) => tab.id
    );
    expect(movieDefaults).toEqual(['all', 'favorite', 'unplayed', 'folder']);
  });

  it('LibraryTypeEnum 的 14 个键与目录一一对应', () => {
    const catalogTypes = Object.keys(TAB_CATALOG) as LibraryTypeEnum[];
    expect(new Set(catalogTypes)).toEqual(new Set(LIBRARY_TYPE_ORDER));
  });

  it('CollectionType → 库类型映射覆盖新增类型', () => {
    expect(COLLECTION_TYPE_MAP.audiobooks).toBe('AUDIOBOOK');
    expect(COLLECTION_TYPE_MAP.musicvideos).toBe('MUSICVIDEO');
    expect(COLLECTION_TYPE_MAP.boxsets).toBe('BOXSET');
    expect(COLLECTION_TYPE_MAP.playlists).toBe('PLAYLIST');
    expect(COLLECTION_TYPE_MAP.games).toBe('GAME');
    expect(COLLECTION_TYPE_MAP.livetv).toBe('LIVETV');
    expect(COLLECTION_TYPE_MAP.channels).toBe('CHANNEL');
    expect(COLLECTION_TYPE_MAP.trailers).toBe('TRAILER');
  });
});
