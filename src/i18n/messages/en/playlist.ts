/**
 * English messages: music personal playlists (docs/doing/音乐个人歌单.md §5.7).
 */
import type { Message } from '@/i18n/types';

export const enPlaylist = {
  'tab.songlists': 'Playlists',
  'playlist.addToPlaylist': 'Add to playlist',
  'playlist.newPlaylist': 'New playlist',
  'playlist.newPlaylistAndAdd': 'Create playlist and add',
  'playlist.namePlaceholder': 'Playlist name',
  'playlist.nameEmpty': 'Please enter a playlist name',
  'playlist.nameTooLong': 'Playlist name can be at most {count} characters',
  'playlist.created': 'Created "{name}"',
  'playlist.createdAndAdded': 'Created and added to "{name}"',
  'playlist.added': 'Added to "{name}"',
  'playlist.remove': 'Remove from playlist',
  'playlist.selectedCount': '{count} selected',
  'playlist.selectAll': 'Select all',
  'playlist.removed': 'Removed from playlist',
  'playlist.rename': 'Rename playlist',
  'playlist.renamed': 'Renamed',
  'playlist.delete': 'Delete playlist',
  'playlist.deleteConfirmMessage':
    'This playlist cannot be recovered. The songs themselves are not affected.',
  'playlist.edit': 'Edit',
  'playlist.editDone': 'Done',
  'playlist.trackCount': ((params) =>
    params.count === 1 ? '1 song' : `${params.count} songs`) as Message,
} as const satisfies Record<string, Message>;
