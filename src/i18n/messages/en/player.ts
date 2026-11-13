/** Player/now playing/photo/reader domain messages (en). */
import type { Message } from '@/i18n/types';
import type { PlayerMessageKey } from '@/i18n/messages/zh/player';

export const enPlayer: Record<PlayerMessageKey, Message> = {
  // —— Player controls ——
  'player.lockScreen': 'Lock screen',
  'player.unlock': 'Unlock',
  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.subtitleMenu': 'Subtitles',
  'player.audioMenu': 'Audio',
  'player.resolutionMenu': 'Transcode resolution',
  'player.playQueue': 'Play queue',
  'player.subtitleOff': 'Off',
  'player.subtitleFallback': 'Subtitle {index}',
  'player.audioFallback': 'Audio track {index}',
  'player.defaultBadge': 'Default',
  'player.forcedBadge': 'Forced',
  'player.transcodeBadge': 'Needs transcode',
  'player.notEmbeddableBadge': 'Not embeddable',
  'player.currentBadge': 'Current',
  'player.collapse': 'Collapse',
  'player.cellularForced': 'Cellular · auto-downgraded to 480p',
  'player.moreMenu': 'More',
  'player.pip': 'Picture in picture',
  'player.abLoop': 'A-B repeat',
  'player.abLoopSetA': 'Point A set at {time}; tap again to set B',
  'player.abLoopActive': 'A-B repeat {a} – {b}',
  'player.abLoopCleared': 'A-B repeat cleared',
  'player.snapshot': 'Snapshot',
  'player.snapshotSaved': 'Snapshot saved to gallery',
  'player.rotate': 'Rotate screen',
  'player.speedMenu': 'Playback speed',
  'player.tabVideo': 'Video',
  'player.aspectTitle': 'Screen aspect ratio',
  'player.aspectDefault': 'Default',
  'player.aspectStretch': 'Stretch',
  'player.aspectFill': 'Fill',
  'player.primarySubtitle': 'Primary subtitles',

  // —— Player states, errors and hints ——
  'player.errorTranscode': 'Transcode playback failed. Please try again',
  'player.errorPlayback': 'Playback error. Please try again',
  'player.exitPlayback': 'Exit playback',
  'player.switchFailed': 'Switch failed. Please play again',
  'player.directResolutionNotice':
    'Direct play is not limited by resolution. The setting applies to the next session',
  'player.hudSeek': '{delta} ({position})',
  'player.episodeTitle': 'Episode {index} · {name}',

  // —— Playback modes ——
  'player.mode.queue': 'List repeat',
  'player.mode.shuffle': 'Shuffle',
  'player.mode.track': 'Repeat one',

  // —— Now Playing ——
  'nowPlaying.title': 'Now Playing',
  'nowPlaying.collapse': 'Collapse Now Playing',
  'nowPlaying.more': 'More actions',
  'nowPlaying.empty': 'Nothing is playing right now',
  'nowPlaying.previousTrack': 'Previous track',
  'nowPlaying.nextTrack': 'Next track',
  'nowPlaying.download': 'Download',
  'nowPlaying.delete': 'Delete',
  'nowPlaying.detail': 'Details',
  'nowPlaying.downloadQueued': 'Added to downloads: {name}',
  'nowPlaying.deleteTitle': 'Delete media',
  'nowPlaying.deleteMessage': 'Delete "{name}" from the server? This cannot be undone.',
  'nowPlaying.deleted': 'Deleted',
  'nowPlaying.lyricsLoading': 'Loading lyrics…',
  'nowPlaying.noLyrics': 'No lyrics',
  'nowPlaying.collapseQueue': 'Collapse queue',

  // —— Play queue panel ——
  'queue.title': ({ mode, count }) =>
    `${mode} (${Number(count) === 1 ? '1 track' : `${count} tracks`})`,
  'queue.modeA11y': 'Playback mode: {mode}. Tap to switch',
  'queue.clear': 'Clear queue',
  'queue.clearTitle': 'Clear queue',
  'queue.clearMessage': 'Removes every track except the current one. Playback continues.',
  'queue.clearAction': 'Clear',
  'queue.empty': 'The queue is empty',
  'queue.removeA11y': 'Remove {title} from queue',
  'queue.collapseSheet': 'Collapse play queue',

  // —— Mini player ——
  'mini.openNowPlaying': 'Open Now Playing',
  'mini.a11y': '{title}. Open Now Playing. Swipe left for next, right for previous',
  'mini.a11yWithArtist':
    '{title}, {artist}. Open Now Playing. Swipe left for next, right for previous',
  'mini.stop': 'Stop playback and hide mini player',

  // —— Audio service ——
  'audio.alreadyInQueue': 'This song is already in the queue',
  'audio.addedToQueue': 'Added to the queue',

  // —— Photo viewer ——
  'photo.saved': 'Saved to the Stream Isle album',
  'photo.viewOriginal': 'View original',
  'photo.viewScaled': 'View scaled',
  'photo.save': 'Save to gallery',
  'photo.originalBadge': 'Original',
  'photo.info': 'Photo info',
  'photo.infoFileName': 'File name',
  'photo.infoResolution': 'Resolution',
  'photo.infoDateAdded': 'Date added',
  'photo.infoReleaseDate': 'Release date',
  'photo.pageLoaded': '{index} / {loaded} loaded',
  'photo.loadingMore': ' · Loading…',
  'photo.empty': 'No photos',
  'photo.folderEmpty': 'This folder is empty',
  'photo.videoEmpty': 'No videos',

  // —— Reader ——
  'reader.modeVertical': 'Vertical scroll',
  'reader.modeHorizontal': 'Horizontal pages',
  'reader.modeA11y': 'Page mode: {mode}',
  'reader.loading': 'Loading',
  'reader.loadingPercent': 'Loading {percent}%',

  // —— Duration and relative time formatting ——
  'format.runtimeHoursMinutes': ({ hours, minutes }) => `${hours} hr ${minutes} min`,
  'format.runtimeHours': ({ hours }) => `${hours} hr`,
  'format.runtimeMinutes': ({ minutes }) => `${minutes} min`,
  'format.justNow': 'Just now',
  'format.minutesAgo': ({ count }) => `${count} minute${Number(count) === 1 ? '' : 's'} ago`,
  'format.hoursAgo': ({ count }) => `${count} hour${Number(count) === 1 ? '' : 's'} ago`,
  'format.daysAgo': ({ count }) => `${count} day${Number(count) === 1 ? '' : 's'} ago`,
};
