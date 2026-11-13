/**
 * MediaManageService 单测：读取本地覆盖优先/缺省服务器配置；
 * 保存先落本地覆盖再尽力回写服务器（全量透传），同步失败保留本地覆盖返回 false。
 */
import type { MediaLibrary, UserConfiguration } from '@/adapter/model';
import { mmkv } from '@/infra/storage';
import { fetchManageState, saveManageState } from '@/service/MediaManageService';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';
import { useLibraryManageStore } from '@/store/libraryManageStore';

jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: jest.fn(),
}));

const KEY = 's1:u1';

const fakeAdapter = {
  getUserViews: jest.fn(),
  getUserConfiguration: jest.fn(),
  updateUserConfiguration: jest.fn(),
};

function lib(id: string): MediaLibrary {
  return { id, name: id, type: 'MIXED' };
}

beforeEach(() => {
  mmkv.clearAll();
  useLibraryManageStore.setState({ overrideByKey: {} });
  useAccountStore.setState({ active: { serverId: 's1', userId: 'u1' } });
  (getActiveAdapter as jest.Mock).mockReturnValue(fakeAdapter);
  fakeAdapter.getUserViews.mockReset().mockResolvedValue([lib('a'), lib('b'), lib('c')]);
  fakeAdapter.getUserConfiguration.mockReset().mockResolvedValue({});
  fakeAdapter.updateUserConfiguration.mockReset().mockResolvedValue(undefined);
});

describe('fetchManageState（读取）', () => {
  it('无本地覆盖：读服务器 OrderedViews/MyMediaExcludes，全量库含隐藏', async () => {
    fakeAdapter.getUserConfiguration.mockResolvedValue({
      OrderedViews: ['c', 'a'],
      MyMediaExcludes: ['b'],
    });
    const state = await fetchManageState();
    expect(fakeAdapter.getUserViews).toHaveBeenCalledWith('u1', true);
    expect(state.orderedLibraryList.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(state.hiddenIdList).toEqual(['b']);
  });

  it('有本地覆盖：优先本地，不读服务器配置', async () => {
    useLibraryManageStore.getState().actions.setOverride(KEY, {
      orderedIdList: ['b', 'a', 'c'],
      hiddenIdList: ['a'],
    });
    const state = await fetchManageState();
    expect(fakeAdapter.getUserConfiguration).not.toHaveBeenCalled();
    expect(state.orderedLibraryList.map((l) => l.id)).toEqual(['b', 'a', 'c']);
    expect(state.hiddenIdList).toEqual(['a']);
  });
});

describe('saveManageState（保存）', () => {
  it('本地覆盖立即落盘 + 服务器全量回写（透传其他字段）', async () => {
    const config: UserConfiguration = { PlayDefaultAudioTrack: true, OrderedViews: [] };
    fakeAdapter.getUserConfiguration.mockResolvedValue(config);
    const synced = await saveManageState(['c', 'b', 'a'], ['b']);
    expect(synced).toBe(true);
    expect(useLibraryManageStore.getState().overrideByKey[KEY]).toEqual({
      orderedIdList: ['c', 'b', 'a'],
      hiddenIdList: ['b'],
    });
    expect(fakeAdapter.updateUserConfiguration).toHaveBeenCalledWith('u1', {
      ...config,
      OrderedViews: ['c', 'b', 'a'],
      MyMediaExcludes: ['b'],
    });
  });

  it('服务器同步失败：保留本地覆盖，返回 false', async () => {
    fakeAdapter.updateUserConfiguration.mockRejectedValue(new Error('403'));
    const synced = await saveManageState(['a'], []);
    expect(synced).toBe(false);
    expect(useLibraryManageStore.getState().overrideByKey[KEY]).toEqual({
      orderedIdList: ['a'],
      hiddenIdList: [],
    });
  });
});