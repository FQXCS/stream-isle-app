/**
 * PlaylistService 单测（docs/doing/音乐个人歌单.md §7.1）：
 * 名称校验兜底（空/超长不发请求）、五个变更操作成功后失效歌单条目缓存
 * （探针注入断言）、创建不触发失效、adapter 透传参数。
 */
import type { ServerAdapter } from '@/adapter/ServerAdapter';
import { PLAYLIST_NAME_MAX_LENGTH } from '@/constant/playlist';
import { AppError } from '@/infra/error';
import { PlaylistService } from '@/service/PlaylistService';

function makeService(adapterOverrides: Partial<ServerAdapter> = {}) {
  const invalidate = jest.fn();
  const adapter = {
    createPlaylist: jest.fn().mockResolvedValue('pl-9'),
    addToPlaylist: jest.fn().mockResolvedValue(undefined),
    getPlaylistItems: jest.fn().mockResolvedValue([]),
    removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
    movePlaylistItem: jest.fn().mockResolvedValue(undefined),
    renamePlaylistItem: jest.fn().mockResolvedValue(undefined),
    deleteItem: jest.fn().mockResolvedValue(undefined),
    ...adapterOverrides,
  } as unknown as jest.Mocked<ServerAdapter>;
  const service = new PlaylistService({
    getAdapter: () => adapter,
    getUserId: () => 'u1',
    invalidate,
  });
  return { service, adapter, invalidate };
}

describe('名称校验（服务层兜底；UI 弹窗已先行拦截）', () => {
  it('空名/纯空白拒绝并抛 UNKNOWN，不发起请求', async () => {
    const { service, adapter } = makeService();
    await expect(service.createPlaylist('')).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(service.createPlaylist('   ')).rejects.toBeInstanceOf(AppError);
    expect(adapter.createPlaylist).not.toHaveBeenCalled();
  });

  it('超长名（> PLAYLIST_NAME_MAX_LENGTH）拒绝；名称 trim 后透传', async () => {
    const { service, adapter } = makeService();
    const longName = '名'.repeat(PLAYLIST_NAME_MAX_LENGTH + 1);
    await expect(service.createPlaylist(longName)).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(service.renamePlaylist('pl-1', longName)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    await service.createPlaylist('  睡前歌单  ');
    expect(adapter.createPlaylist).toHaveBeenCalledWith('u1', '睡前歌单', undefined);
  });
});

describe('变更操作成功后失效歌单条目缓存（正确性红线）', () => {
  it('addToPlaylist / removeFromPlaylist / movePlaylistItem / renamePlaylist / deletePlaylist 各触发一次失效', async () => {
    const { service, adapter, invalidate } = makeService();
    await service.addToPlaylist('pl-1', ['s1']);
    expect(invalidate).toHaveBeenLastCalledWith('pl-1');
    await service.removeFromPlaylist('pl-1', ['e1']);
    expect(invalidate).toHaveBeenLastCalledWith('pl-1');
    await service.movePlaylistItem('pl-1', 'e1', 2);
    expect(invalidate).toHaveBeenLastCalledWith('pl-1');
    await service.renamePlaylist('pl-1', '新名');
    expect(invalidate).toHaveBeenLastCalledWith('pl-1');
    expect(adapter.renamePlaylistItem).toHaveBeenCalledWith('u1', 'pl-1', '新名');
    await service.deletePlaylist('pl-1');
    expect(invalidate).toHaveBeenLastCalledWith('pl-1');
    // 删除复用通用条目删除（DELETE /Items/{itemId}）
    expect(adapter.deleteItem).toHaveBeenCalledWith('pl-1');
    expect(invalidate).toHaveBeenCalledTimes(5);
  });

  it('createPlaylist 透传 itemIds 且不触发失效（新歌单无缓存可失效）', async () => {
    const { service, adapter, invalidate } = makeService();
    const id = await service.createPlaylist('歌单', ['s1', 's2']);
    expect(id).toBe('pl-9');
    expect(adapter.createPlaylist).toHaveBeenCalledWith('u1', '歌单', ['s1', 's2']);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('加入查重：目标歌单已有的歌曲被过滤，只提交差集', async () => {
    const { service, adapter } = makeService({
      getPlaylistItems: jest
        .fn()
        .mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
    });
    await service.addToPlaylist('pl-1', ['s2', 's3', 's4']);
    // s2 已存在 → 只加 s3/s4
    expect(adapter.addToPlaylist).toHaveBeenCalledWith('u1', 'pl-1', ['s3', 's4']);
  });

  it('加入查重：全部命中抛 PLAYLIST_DUPLICATE，不发加入请求、不失效缓存', async () => {
    const { service, adapter, invalidate } = makeService({
      getPlaylistItems: jest.fn().mockResolvedValue([{ id: 's1' }]),
    });
    await expect(service.addToPlaylist('pl-1', ['s1'])).rejects.toMatchObject({
      code: 'PLAYLIST_DUPLICATE',
    });
    expect(adapter.addToPlaylist).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('变更失败（如 403 FORBIDDEN）不失效缓存且异常上抛由 UI 提示', async () => {
    const { service, invalidate } = makeService({
      addToPlaylist: jest.fn().mockRejectedValue(new AppError('FORBIDDEN')),
    });
    await expect(service.addToPlaylist('pl-1', ['s1'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
