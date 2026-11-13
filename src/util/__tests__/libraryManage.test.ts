/**
 * 媒体管理纯函数单测：orderLibraries 声明优先/未声明垫底保持原序；
 * applyManageOverride 无覆盖原样、有覆盖滤隐藏 + 重排。
 */
import type { MediaLibrary } from '@/adapter/model';
import { applyManageOverride, orderLibraries } from '@/util/libraryManage';

function lib(id: string): MediaLibrary {
  return { id, name: id, type: 'MIXED' };
}

const LIST = [lib('a'), lib('b'), lib('c')];

describe('orderLibraries（OrderedViews 重排）', () => {
  it('声明者按声明顺序在前', () => {
    expect(orderLibraries(LIST, ['c', 'a']).map((l) => l.id)).toEqual(['c', 'a', 'b']);
  });

  it('未声明者保持原序垫底；空声明原序', () => {
    expect(orderLibraries(LIST, ['b']).map((l) => l.id)).toEqual(['b', 'a', 'c']);
    expect(orderLibraries(LIST, []).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('不修改入参', () => {
    orderLibraries(LIST, ['c', 'b', 'a']);
    expect(LIST.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('applyManageOverride（显隐 + 顺序覆盖）', () => {
  it('无覆盖原样返回', () => {
    expect(applyManageOverride(LIST).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('有覆盖滤隐藏 + 重排', () => {
    const result = applyManageOverride(LIST, {
      orderedIdList: ['c', 'b', 'a'],
      hiddenIdList: ['b'],
    });
    expect(result.map((l) => l.id)).toEqual(['c', 'a']);
  });
});