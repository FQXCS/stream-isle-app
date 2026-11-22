/**
 * 歌单编辑模式 hook（音乐个人歌单文档 §5.6.4）：
 * 编辑开关、可编辑判定、拖动排序与移除的乐观更新 + 失败回滚、重命名、删除。
 * 排序/移除直接经 updateTrackList 乐观更新页面详情 state（无本地副本、无同步 effect），
 * 失败回滚写回操作前列表；成功后 PlaylistService 内部已失效歌单条目缓存，
 * 页面重新聚焦时 loadPlaylist 重拉即得服务端最新顺序。
 * 二次确认（删除歌单）由页面负责，本 hook 不做确认。
 */
import { useCallback, useState } from 'react';

import type { AudioItem } from '@/adapter/model';
import { showCenterToast, showToast } from '@/component/Toast';
import { AppError, errorMessageOf } from '@/infra/error';
import { useT } from '@/i18n';
import { playlistService } from '@/service/PlaylistService';

/** 操作失败 Toast（文案取错误码映射唯一出处） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

/** 本地列表重排（拖动 from → to，0-based；手写 splice 不依赖库导出） */
function arrayMove(list: AudioItem[], from: number, to: number): AudioItem[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export interface PlaylistEditorDeps {
  playlistId: string;
  /** 页面详情的曲目列表（乐观更新直接写回页面 state，重聚焦重拉自动同步） */
  trackList: AudioItem[];
  /** 乐观更新入口（页面以 setDetail 写回 trackList） */
  updateTrackList: (next: AudioItem[]) => void;
}

export interface PlaylistEditor {
  /** 编辑态开关（页面「编辑/完成」按钮） */
  editing: boolean;
  setEditing: (value: boolean) => void;
  /** 可编辑判定：曲目全量带 playlistEntryId（缺失 = 服务器未返回条目 id，整单降级只读） */
  editable: boolean;
  /** 拖动排序（from/to 0-based；乐观重排 → 服务器 Move，失败回滚 + toast） */
  moveItem: (from: number, to: number) => void;
  /** 移除歌单条目（乐观摘除 → 服务器删除，失败回滚 + toast） */
  removeItem: (index: number) => void;
  /** 重命名歌单（成功返回新名供页面更新标题；失败 toast 并抛出） */
  rename: (name: string) => Promise<string>;
  /** 删除歌单（成功后由页面导航返回） */
  removePlaylist: () => Promise<void>;
}

export function usePlaylistEditor({
  playlistId,
  trackList,
  updateTrackList,
}: PlaylistEditorDeps): PlaylistEditor {
  const tr = useT();
  const [editing, setEditing] = useState(false);

  const editable =
    trackList.length > 0 &&
    trackList.every((track) => track.playlistEntryId !== undefined && track.playlistEntryId !== '');

  const moveItem = useCallback(
    (from: number, to: number) => {
      if (from === to) {
        return;
      }
      const entryId = trackList[from]?.playlistEntryId;
      if (entryId === undefined || entryId === '') {
        return;
      }
      const previous = trackList;
      updateTrackList(arrayMove(trackList, from, to));
      playlistService.movePlaylistItem(playlistId, entryId, to).catch((err: unknown) => {
        // 服务器拒绝（403/顺序冲突等）回滚本地重排，用户可重试
        updateTrackList(previous);
        toastError(err);
      });
    },
    [trackList, playlistId, updateTrackList]
  );

  const removeItem = useCallback(
    (index: number) => {
      const entryId = trackList[index]?.playlistEntryId;
      if (entryId === undefined || entryId === '') {
        return;
      }
      const previous = trackList;
      updateTrackList(trackList.filter((_, i) => i !== index));
      playlistService
        .removeFromPlaylist(playlistId, [entryId])
        .then(() => {
          showCenterToast(tr('playlist.removed'));
        })
        .catch((err: unknown) => {
          updateTrackList(previous);
          toastError(err);
        });
    },
    [trackList, playlistId, updateTrackList, tr]
  );

  const rename = useCallback(
    async (name: string) => {
      try {
        await playlistService.renamePlaylist(playlistId, name);
        showCenterToast(tr('playlist.renamed'));
        return name;
      } catch (err) {
        toastError(err);
        throw err;
      }
    },
    [playlistId, tr]
  );

  const removePlaylist = useCallback(async () => {
    await playlistService.deletePlaylist(playlistId);
  }, [playlistId]);

  return { editing, setEditing, editable, moveItem, removeItem, rename, removePlaylist };
}
