/**
 * 歌曲列表多选状态 hook（音乐个人歌单二改，2026-11-15）：
 * 长按任一行进入多选态并选中该行；多选态下点行切换选中、可全选；
 * 「加入歌单」经 PlaylistPickerSheet 提交（批量传选中 id 列表），
 * 成功后经 onAdded 退出多选态。纯状态无副作用，请求由 PlaylistPickerSheet 编排。
 */
import { useCallback, useState, type ReactNode } from 'react';

import { MultiSelectBar } from '@/component/MultiSelectBar';
import { PlaylistPickerSheet } from '@/component/PlaylistPickerSheet';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';

export interface SongMultiSelect {
  /** 是否处于多选态 */
  selecting: boolean;
  /** 已选中歌曲 id 集合 */
  selectedIdSet: ReadonlySet<string>;
  /** 选中数量（页面操作栏展示） */
  selectedCount: number;
  /** 长按进入多选态并选中该行 */
  enter: (songId: string) => void;
  /** 多选态下点行：切换选中 */
  toggle: (songId: string) => void;
  /** 全选（传入当前列表全部 id） */
  selectAll: (songIds: readonly string[]) => void;
  /** 取消全部选中（保持在多选态） */
  clear: () => void;
  /** 退出多选态并清空选中 */
  exit: () => void;
}

export function useSongMultiSelect(): SongMultiSelect {
  const [selecting, setSelecting] = useState(false);
  const [selectedIdSet, setSelectedIdSet] = useState<ReadonlySet<string>>(new Set());

  const enter = useCallback((songId: string) => {
    setSelecting(true);
    setSelectedIdSet(new Set([songId]));
  }, []);

  const toggle = useCallback((songId: string) => {
    setSelectedIdSet((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((songIds: readonly string[]) => {
    setSelectedIdSet(new Set(songIds));
  }, []);

  const clear = useCallback(() => {
    setSelectedIdSet(new Set());
  }, []);

  const exit = useCallback(() => {
    setSelecting(false);
    setSelectedIdSet(new Set());
  }, []);

  return { selecting, selectedIdSet, selectedCount: selectedIdSet.size, enter, toggle, selectAll, clear, exit };
}

export interface MultiSelectAddToPlaylist {
  /** 多选态下的操作栏 + 歌单选择器（页面在多选态渲染；非多选态为 null） */
  block: ReactNode;
  /** 行长按进入多选态（页面 SongRow.onLongPress 直接绑定） */
  enter: (songId: string) => void;
  /** 多选态下点行：切换选中 */
  toggle: (songId: string) => void;
  /** 本行是否选中 */
  isSelected: (songId: string) => boolean;
  /** 多选态下点行加入歌单 */
  openPicker: () => void;
}

/**
 * 多选批量加入歌单的组合封装（状态 hook + 底部操作栏 + 歌单选择器 + 提交回调）：
 * 页面只负责把 enter/toggle/isSelected 接到 SongRow 与渲染 block。
 * allSongIds 供「全选」使用（当前列表全部歌曲 id）。
 */
export function useMultiSelectAddToPlaylist(
  multiSelect: SongMultiSelect,
  allSongIds: () => readonly string[]
): MultiSelectAddToPlaylist {
  const miniPlayerPadding = useMiniPlayerPadding();
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = useCallback(() => setPickerVisible(true), []);
  const enter = multiSelect.enter;
  const toggle = multiSelect.toggle;
  const isSelected = useCallback(
    (songId: string) => multiSelect.selectedIdSet.has(songId),
    [multiSelect.selectedIdSet]
  );

  const block = multiSelect.selecting ? (
    <>
      <MultiSelectBar
        selectedCount={multiSelect.selectedCount}
        onSelectAll={() => multiSelect.selectAll(allSongIds())}
        onAdd={openPicker}
        onCancel={multiSelect.exit}
        bottomInset={24 + miniPlayerPadding}
      />
      {pickerVisible && (
        <PlaylistPickerSheet
          visible
          itemIdsToAdd={[...multiSelect.selectedIdSet]}
          onClose={() => setPickerVisible(false)}
          onAdded={multiSelect.exit}
        />
      )}
    </>
  ) : null;

  return { block, enter, toggle, isSelected, openPicker };
}
