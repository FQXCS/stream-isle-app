/**
 * English messages. Typed as Record<MessageKey, Message> so a missing or misspelled
 * key is a compile error against the Chinese source of truth.
 */
import type { Message } from '@/i18n/types';
import { zhBase } from '@/i18n/messages/zh/base';

export const enBase: Record<keyof typeof zhBase, Message> = {
  // —— Common ——
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.ok': 'OK',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.retry': 'Retry',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.loading': 'Loading…',
  'common.unknownError': 'Unknown error',
  'common.none': 'None',

  // —— Bottom tabs ——
  'nav.tabLibrary': 'Library',
  'nav.tabMediaServer': 'Servers',
  'nav.tabSettings': 'Settings',
  'nav.back': 'Back',
  'nav.search': 'Search',
  'nav.artist': 'Artist',
  'nav.playlist': 'Playlist',
  'nav.album': 'Album',
  'nav.person': 'Person',
  'nav.libraryDisplayTitle': 'Library tabs · {flavor}',
  'nav.tabCategories': 'Tabs',
  'nav.sortOptions': 'Sort options',
  'nav.libraryTabEditorTitle': 'Tabs · {type}',
  'nav.sortTabsTitle': 'Sort options · {type}',
  'nav.sortEditorTitle': 'Sort options · {type} · {tab}',

  // —— TV-specific (TV-m1; sidebar / placeholder copy, mirrored from zh source) ——
  'tv.tabHome': 'Home',
  'tv.savedServers': 'Saved servers',
  'tv.usePasswordLogin': 'Use password sign-in',
  'tv.searchPlaceholder': 'Search is in development and coming soon',
  'tv.settingsPlaceholder': 'Settings are in development and coming soon',
  'tv.unsupportedLibrary': 'This library type is not supported on TV yet',
  // —— TV player (TV-m3; snapshot slice / delay stepper copy, mirrored from zh source) ——
  'tv.snapshotSavedPath': 'Snapshot saved: {path}',
  'tv.snapshotFailed': 'Snapshot failed',
  'tv.delayReset': '{label} {value}s, long-press to reset',

  // —— Settings ——
  'settings.title': 'Settings',
  'settings.playback': 'Playback',
  'settings.appearance': 'Appearance',
  'settings.sameFlavorConfig': 'Server type configuration',
  'settings.about': 'About',
  'settings.language': 'Language',
  'settings.languageDesc': 'App display language. Follow system to match your device.',
  'settings.languageSystem': 'Follow system',
  'settings.languageZh': '简体中文',
  'settings.languageEn': 'English',
  'settings.theme': 'Theme',
  'settings.themeDesc':
    'Light by default; immersive media pages (Player, Photo Viewer, Now Playing) stay dark',
  'settings.accentScheme': 'Accent color',
  'settings.accentSchemeDesc': 'Global accent color, adapted for light and dark themes',
  'settings.defaultSubtitle': 'Default subtitle language',
  'settings.defaultSubtitleDesc':
    'Automatically select tracks in this language during playback (external text tracks only)',
  'settings.includedTypes': 'Included types',
  'settings.includedTypesDesc': 'Configure Continue Watching and Watch History separately',
  'settings.downloads': 'Downloads',
  'settings.downloadsDesc': 'Manage offline tasks; playback works without network',
  'settings.history': 'Watch history',
  'settings.historyDesc': 'Watched items from the server, newest first',
  'settings.appName': 'App name',
  'settings.version': 'Version',
  'settings.versionDesc': 'Check for new versions and release notes',
  'settings.maxResolution': 'Max transcode resolution',
  'settings.maxResolutionDesc': 'Upper limit for transcoded output (direct play is unaffected)',
  'settings.allowHevc': 'Allow HEVC direct play',
  'settings.allowHevcDesc': 'Disable on problematic devices to transcode everything',
  'settings.cellularDowngrade': 'Auto-downgrade on cellular',
  'settings.cellularDowngradeDesc': 'Use 480p on cellular by default; you can change it manually',
  'settings.resumePlayback': 'Resume playback',
  'settings.resumePlaybackDesc':
    'Continue from where you stopped; when off, always start from the beginning',
  'settings.buffer': 'Buffering',
  'settings.bufferTier': 'Buffer preset',
  'settings.bufferTierDesc': 'Preload strategy; applies on next playback',
  'settings.bufferCustomTime': 'Buffer duration',
  'settings.bufferCustomTimeDesc': 'Preload by seconds or percentage of runtime (pick one)',
  'settings.bufferTimeSeconds': 'Seconds',
  'settings.bufferTimePercent': 'Runtime %',
  'settings.bufferCustomMb': 'Memory cap',
  'settings.bufferCustomMbDesc': '0 = unlimited; otherwise stops at whichever of duration/bytes comes first',
  'settings.bufferCustomBack': 'Rewind buffer',
  'settings.bufferCustomBackDesc': 'Media kept before the current position for instant rewind; 0 = off',

  // —— Software update ——
  'update.title': 'Software update',
  'update.check': 'Check for updates',
  'update.checking': 'Checking…',
  'update.statusChecking': 'Checking for updates…',
  'update.statusLatest': "You're up to date",
  'update.statusAvailable': 'Version {version} is available',
  'update.statusFailed': 'Update check failed',
  'update.failedHint': 'Check your network connection and try again',
  'update.releaseNotes': "What's new",
  'update.noNotes': 'No release notes for this version',
  'update.download': 'Download',
  'update.openReleases': 'Open Releases in browser',
  'update.sourceHint': 'Version information from GitHub Releases',

  // —— Transcode resolution tiers ——
  'resolution.unlimited': 'Original',
  'resolution.uhd': '4K',
  'resolution.fhd': '1080p',
  'resolution.hd': '720p',
  'resolution.sd': '480p',

  // —— Video buffer presets ——
  'buffer.dataSaver': 'Data saver',
  'buffer.dataSaverDesc': '15s buffer + 50MB cap; saves data and memory',
  'buffer.balanced': 'Balanced',
  'buffer.balancedDesc': '30s buffer; balances smoothness and memory',
  'buffer.smooth': 'Smooth',
  'buffer.smoothDesc': '50s buffer + 15s back-buffer; instant rewind',
  'buffer.unlimited': 'Unlimited',
  'buffer.unlimitedDesc': 'Up to 10min buffer + memory safety valve',
  'buffer.custom': 'Custom',
  'buffer.customDesc': 'Set duration (s / runtime %) and memory cap yourself',

  // —— Player restart overlay ——
  'playback.burnInRestart': 'This subtitle requires server transcoding. Switching…',
  'playback.resolutionRestart': 'Switching resolution…',
  'playback.audioRestart': 'Switching audio track…',
  'playback.autoNextRestart': 'Playing next episode…',

  // —— Theme modes ——
  'theme.system': 'Follow system',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  // —— Accent schemes ——
  'accent.emerald': 'Emerald',
  'accent.blue': 'Mist Blue',
  'accent.indigo': 'Indigo',
  'accent.coral': 'Coral',
  'accent.graphite': 'Graphite',
  'accent.berry': 'Berry',
  'accent.caramel': 'Caramel',

  // —— Subtitle languages ——
  'subtitleLang.followDefault': 'Follow default (Chinese)',
  'subtitleLang.zh': 'Chinese',
  'subtitleLang.en': 'English',
  'subtitleLang.ja': 'Japanese',
  'subtitleLang.ko': 'Korean',

  // —— Errors (aligned with AppErrorCode) ——
  'error.INVALID_ADDRESS': 'Invalid address. Enter a URL such as http://192.168.1.5:8096',
  'error.NETWORK_UNREACHABLE':
    'Cannot reach the server. Check the address and network, then try again',
  'error.TLS_ERROR':
    'Server certificate verification failed. If this is a self-signed certificate, enable "Ignore certificate validation" in Settings and try again',
  'error.NOT_MEDIA_SERVER': 'This address is not an Emby/Jellyfin server',
  'error.LOGIN_FAILED': 'Incorrect username or password',
  'error.UNAUTHORIZED': 'Your session has expired. Please enter your password again',
  'error.NOT_FOUND': 'The content does not exist or has been removed',
  'error.RATE_LIMITED': 'The server is busy. Please try again later',
  'error.SERVER_ERROR': 'Internal server error. Please try again later',
  'error.PLAYBACK_UNSUPPORTED':
    'Cannot play: the server cannot direct-play or transcode this file',
  'error.AUDIO_ENGINE_INIT_FAILED': 'Failed to initialize the audio engine. Please restart the app',
  'error.PHOTO_SAVE_FAILED': 'Failed to save to the photo library. Please try again',
  'error.PHOTO_SAVE_PERMISSION_DENIED': 'Photo library write permission is required to save',
  'error.QUICK_CONNECT_DISABLED':
    'Quick Connect is not enabled on this server. Please sign in with a password',
  'error.QUICK_CONNECT_TIMEOUT': 'Authorization timed out. Please try again',
  'error.QUICK_CONNECT_CANCELLED': 'Quick Connect sign-in cancelled',
  'error.QUICK_CONNECT_EXPIRED': 'The authorization code has expired. Please start again',
  'error.DOWNLOAD_UNAVAILABLE': 'This item requires transcoding and cannot be downloaded yet',
  'error.DOWNLOAD_NO_SPACE': 'Not enough storage space',
  'error.DOWNLOAD_DUPLICATE': 'This item is already in the download list',
  'error.DOWNLOAD_CREDENTIAL_MISSING':
    'Download credentials are missing. Please sign in to this server again and retry',
  'error.NOT_IMPLEMENTED': 'Feature under development',
  'error.FORBIDDEN': 'Not allowed: the server rejected this operation',
  'error.PLAYLIST_DUPLICATE': 'The selected songs are already in this playlist',
  'error.UNKNOWN': 'Something went wrong. Please try again later',
};
