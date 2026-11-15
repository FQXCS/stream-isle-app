/**
 * 中文文案：音乐个人歌单（docs/doing/音乐个人歌单.md §5.7）。
 */
import type { Message } from '@/i18n/types';

export const zhPlaylist = {
  // Tab 栏与设置页（仅音乐库段使用，其余库类型保留 tab.playlists「播放列表」）
  'tab.songlists': '歌单',
  // 加入歌单（歌曲行长按菜单 / 专辑详情按钮 / 选择器）
  'playlist.addToPlaylist': '加入歌单',
  'playlist.newPlaylist': '新建歌单',
  'playlist.newPlaylistAndAdd': '新建歌单并加入',
  'playlist.namePlaceholder': '歌单名称',
  'playlist.nameEmpty': '请输入歌单名称',
  'playlist.nameTooLong': '歌单名称最多 {count} 个字符',
  'playlist.created': '已创建《{name}》',
  'playlist.createdAndAdded': '已创建并加入《{name}》',
  'playlist.added': '已加入《{name}》',
  // 歌单详情编辑
  'playlist.remove': '移出歌单',
  // 多选批量加入（音乐个人歌单二改）
  'playlist.selectedCount': '已选 {count} 首',
  'playlist.selectAll': '全选',
  'playlist.removed': '已移出歌单',
  'playlist.rename': '重命名歌单',
  'playlist.renamed': '已重命名',
  'playlist.delete': '删除歌单',
  'playlist.deleteConfirmMessage': '删除后该歌单不可恢复，歌曲不受影响。',
  'playlist.edit': '编辑',
  'playlist.editDone': '完成',
  // 网格卡片 / 选择器行副标题（曲目数）
  'playlist.trackCount': ((params) => `${params.count} 首`) as Message,
} as const satisfies Record<string, Message>;
