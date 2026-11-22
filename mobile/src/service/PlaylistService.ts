/**
 * 音乐个人歌单服务（docs/doing/音乐个人歌单.md §5.5）：
 * 创建/加入/移除/排序/重命名/删除的编排层；名称校验与「变更后失效歌单条目缓存」
 * 在此收敛，UI 只消费成功/失败。模式对齐 AudioService（类 + 模块级单例 + 依赖注入可测）。
 * 删除前二次确认由 UI 负责，本服务不做确认。
 */
import type { GetAdapterFn } from '@/service/AudioService';
import { PLAYLIST_NAME_MAX_LENGTH } from '@/constant/playlist';
import { AppError } from '@/infra/error';
import { invalidatePlaylistCache } from '@/service/LibraryBrowseService';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

/** 可注入依赖（单测注入 fake adapter 与失效探针） */
export interface PlaylistServiceDeps {
  getAdapter: GetAdapterFn;
  /** 活跃账号 userId 守卫（与 BrowseService.requireUserId 同口径） */
  getUserId: () => string;
  /** 歌单条目缓存失效钩子（缺省绑 LibraryBrowseService.invalidatePlaylistCache） */
  invalidate?: (playlistId: string) => void;
}

export class PlaylistService {
  private readonly getAdapter: GetAdapterFn;
  private readonly getUserId: () => string;
  private readonly invalidate: (playlistId: string) => void;

  constructor(deps: PlaylistServiceDeps) {
    this.getAdapter = deps.getAdapter;
    this.getUserId = deps.getUserId;
    this.invalidate = deps.invalidate ?? invalidatePlaylistCache;
  }

  /**
   * 名称校验：trim 后非空且不超长（UI 弹窗已先拦截并给出专用文案，此处为服务层兜底，
   * 空名/超长名不应打到服务器）。
   */
  private assertValidName(name: string): string {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PLAYLIST_NAME_MAX_LENGTH) {
      throw new AppError('UNKNOWN');
    }
    return trimmed;
  }

  /** 创建歌单（itemIds 可空 = 空歌单；带曲目则创建即加入，返回新歌单 id） */
  async createPlaylist(name: string, itemIds?: string[]): Promise<string> {
    const trimmed = this.assertValidName(name);
    return this.getAdapter().createPlaylist(this.getUserId(), trimmed, itemIds);
  }

  /**
   * 加入曲目（itemIds 为歌曲 id；成功后失效该歌单缓存）。
   * 加入前按目标歌单现有曲目查重（音乐个人歌单四改）：过滤已存在的歌曲，
   * 只提交差集——避免同一歌曲在同一歌单重复出现；全部命中抛 PLAYLIST_DUPLICATE。
   */
  async addToPlaylist(playlistId: string, itemIds: string[]): Promise<void> {
    const existing = await this.getAdapter().getPlaylistItems(this.getUserId(), playlistId);
    const existingIds = new Set(existing.map((track) => track.id));
    const newIds = itemIds.filter((id) => !existingIds.has(id));
    if (newIds.length === 0) {
      throw new AppError('PLAYLIST_DUPLICATE');
    }
    await this.getAdapter().addToPlaylist(this.getUserId(), playlistId, newIds);
    this.invalidate(playlistId);
  }

  /** 移除歌单条目（entryIds = AudioItem.playlistEntryId；成功后失效该歌单缓存） */
  async removeFromPlaylist(playlistId: string, entryIds: string[]): Promise<void> {
    await this.getAdapter().removeFromPlaylist(playlistId, entryIds);
    this.invalidate(playlistId);
  }

  /** 移动歌单条目（entryId 与 0-based newIndex；成功后失效该歌单缓存） */
  async movePlaylistItem(playlistId: string, entryId: string, newIndex: number): Promise<void> {
    await this.getAdapter().movePlaylistItem(playlistId, entryId, newIndex);
    this.invalidate(playlistId);
  }

  /** 重命名歌单（读-改-写在 adapter 内；成功后失效该歌单缓存） */
  async renamePlaylist(playlistId: string, name: string): Promise<void> {
    const trimmed = this.assertValidName(name);
    await this.getAdapter().renamePlaylistItem(this.getUserId(), playlistId, trimmed);
    this.invalidate(playlistId);
  }

  /** 删除歌单（DELETE /Items/{itemId}，仅删歌单条目不碰歌曲；成功后失效该歌单缓存） */
  async deletePlaylist(playlistId: string): Promise<void> {
    await this.getAdapter().deleteItem(playlistId);
    this.invalidate(playlistId);
  }
}

function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 PlaylistService');
  }
  return active.userId;
}

/** 全局单例（依赖经箭头函数延迟取值，适配 adapterProvider 的按需构造） */
export const playlistService = new PlaylistService({
  getAdapter: () => getActiveAdapter(),
  getUserId: requireUserId,
});
