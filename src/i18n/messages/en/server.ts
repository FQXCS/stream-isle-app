/** Server/Onboarding/settings sub-pages domain messages (en). */
import type { Message } from '@/i18n/types';
import type { ServerMessageKey } from '@/i18n/messages/zh/server';

export const enServer: Record<ServerMessageKey, Message> = {
  // —— Shared (server domain) ——
  'server.done': 'Done',
  'server.edit': 'Edit',
  'server.add': 'Add',
  'server.addServer': 'Add server',
  'server.moreActions': 'More actions',
  'server.unnamedServer': 'Unnamed server',
  'server.defaultRoute': 'Default route',

  // —— Servers tab: card stats and action menu ——
  'server.cardStats': 'Movies: {movies} · Series: {series}',
  'server.menuRoutes': 'Connection routes',
  'server.menuRefreshStats': 'Refresh details',
  'server.menuSetPrivate': 'Mark as private',
  'server.menuUnsetPrivate': 'Unmark private',
  'server.menuIgnoreTls': 'Ignore certificate checks',
  'server.menuUnignoreTls': 'Stop ignoring certificate',
  'server.statsRefreshed': 'Server details refreshed',
  'server.statsRefreshFailed': 'Refresh failed. Check the server connection',
  'server.refreshAllDone': 'All server details refreshed',
  'server.refreshAllPartial': ({ failed }) => `Refresh finished, ${failed} failed`,

  // —— Servers tab: deletion and multi-select mode ——
  'server.deleteTitle': 'Delete server',
  'server.deleteConfirm': 'Delete "{name}" and all of its accounts?',
  'server.deleteSelectedConfirm': ({ count }) =>
    count === 1
      ? 'Delete the selected server and its accounts?'
      : `Delete the ${count} selected servers and their accounts?`,
  'server.deleteSelected': 'Delete selected servers',
  'server.selectAll': 'Select all',
  'server.deselectAll': 'Deselect all',
  'server.selectedCount': ({ count }) => `${count} selected`,
  'server.sortTitle': 'Sort',
  'server.menuRefreshAll': 'Refresh all',
  'server.emptyTitle': 'No servers yet',
  'server.emptyHint': 'Tap "+" in the top right to add an Emby / Jellyfin server',

  // —— Library tab ——
  'server.viewAll': 'See all',
  'server.viewAllOf': 'See all {title}',
  'server.sectionResume': 'Continue Watching',
  'server.sectionNextUp': 'Next Up',
  'server.sectionLatest': 'Recently Added',
  'server.sectionMyMedia': 'My Media',
  'server.refreshHome': 'Refresh home',
  'server.mediaManage': 'Manage media',
  'server.mediaManageSoon': 'Media management is coming soon',
  'server.noAccountForServer': 'This server has no account yet. Sign in on the Servers tab first',
  'server.guestTitle': 'Your library is empty',
  'server.guestHint':
    'Add an Emby / Jellyfin server and Continue Watching and Recently Added will show up here',
  'server.libraryEmptyTitle': 'Nothing in your library yet',
  'server.libraryEmptySubtitle':
    'Add a server and Continue Watching and Recently Added will show up here',
  'server.switchServer': 'Switch library server',
  'server.openLibrary': 'Open library {name}',
  'server.continueWatchingOf': 'Continue watching {name}',
  'server.itemCount': ({ count }) => (count === 1 ? '1 item' : `${count} items`),

  // —— Search ——
  'server.searchPlaceholder': 'Search movies, shows, people',
  'server.searchEmptyTitle': 'Type a keyword to search movies, shows, and people',
  'server.searchNoResult': 'No results for "{keyword}"',
  'server.clearSearch': 'Clear search',

  // —— Add / edit server form ——
  'server.editServerTitle': 'Edit server',
  'server.addFlavorTitle': 'Add {flavor}',
  'server.formName': 'Name',
  'server.formProtocol': 'Protocol',
  'server.formAddress': 'Server address',
  'server.formPath': 'Path',
  'server.formPort': 'Port',
  'server.formAccount': 'Account (username)',
  'server.formUsername': 'Username',
  'server.formPassword': 'Password',
  'server.placeholderName': 'Optional (fetched automatically)',
  'server.placeholderHost': 'Required (127.0.0.1/sample)',
  'server.placeholderPath': 'Optional (/path)',
  'server.placeholderRequired': 'Required',
  'server.placeholderPasswordKeep': 'Leave blank to keep the account unchanged',
  'server.placeholderPasswordStored': 'Saved and encrypted; you can change it',
  'server.placeholderPasswordOptional': 'Optional',
  'server.showPassword': 'Show password',
  'server.hidePassword': 'Hide password',
  'server.saving': 'Saving…',
  'server.verifyingAddress': 'Verifying address…',
  'server.connectingServer': 'Connecting to server…',
  'server.editNeedsPassword': 'Enter a password to change the account',
  'server.usernameRequired': 'Enter a username',
  'server.operationFailed': 'Operation failed. Please try again',
  'server.ignoreTlsRetry': "Ignore this server's certificate check and retry",
  'server.addHint':
    'The server type is set by the entry point. After adding, you are signed in and switched to this server automatically; you can also use the app without signing in and the library stays empty.',
  'server.editHint':
    'The password is stored encrypted and filled in automatically. Signing in again is only required when changing the account or password; changing the name or address keeps the account.',

  // —— Connection routes ——
  'server.routesTitle': 'Connection routes',
  'server.addBackupRoute': 'Add backup route',
  'server.editRouteTitle': 'Edit route',
  'server.serverMissing': 'Server not found',
  'server.routeDeleteTitle': 'Delete route',
  'server.routeDeleteConfirm':
    'Once deleted, this address is no longer used for failover. Delete it?',
  'server.routeSwitched': 'Switched to "{name}"',
  'server.routesHint':
    'If a request fails on the current route, the next route is used automatically. You can also tap a route to switch manually.',
  'server.routeEditHint':
    'Backup routes share the server account, so no new sign-in is needed. Changes take effect immediately and requests fail over to the next route automatically.',

  // —— Settings sub-pages: library display / tabs / sort ——
  'server.libraryTypes': 'Library types',
  'server.tabCategoriesDesc': 'Choose which tabs appear at the top of library pages (up to 5 per type, drag to reorder)',
  'server.sortOptionsDesc': 'Configure sort fields per library type and tab (drag to reorder)',
  'server.defaultDisplay': 'Default tab',
  'server.defaultTabLabel': 'Opens when entering the library',
  'server.enabledTabsHint': 'Enabled ({count}/{max}) · Long press',
  'server.enabledSortsHint': 'Enabled ({count}) · Long press',
  'server.dragToReorder': 'to reorder',
  'server.keepOne': 'Keep at least one',
  'server.maxTabs': 'Up to {max}',
  'server.disabledSection': 'Not enabled',
  'server.resetDefault': 'Restore defaults',
  'server.sortNotSupported': 'Sorting not supported',
  'server.sortableTabsCount': ({ count }) =>
    count === 1 ? '1 sortable tab' : `${count} sortable tabs`,
  'server.sortableTabsCustomized': ({ count }) =>
    count === 1 ? '1 sortable tab · Customized' : `${count} sortable tabs · Customized`,
  'server.followPrimaryTab': 'Follows "{tab}"',
  'server.sortSelectedCount': ({ count }) => `${count} selected`,
  'server.categoryMissing': 'Category not found',
  'server.categoryNotSortable': 'Sorting is not supported for this category',

  // —— Background playback guide ——
  'server.batteryTitle': 'Background playback settings',
  'server.batteryMessage':
    'To keep background playback from being interrupted by battery optimization, allow ignoring battery optimization. On Xiaomi, Huawei, and similar devices, also allow autostart and background running in system settings.',
  'server.batteryLater': 'Not now',
  'server.batteryGoSettings': 'Open settings',

  // —— Onboarding: connect ——
  'server.connectTitle': 'Connect to server',
  'server.connectHint': 'Enter your Jellyfin / Emby server address, e.g. http://192.168.1.5:8096',
  'server.probing': 'Probing…',
  'server.connect': 'Connect',
  'server.next': 'Next',
  'server.version': 'Version {version}',
  'server.versionTooLow':
    'The version is too old (below Jellyfin 10.8 / Emby 4.7). Some features may not work, but you can continue',

  // —— Onboarding: sign in ——
  'server.loginTitle': 'Sign in',
  'server.loginServerLabel': '{name} ({flavor})',
  'server.savedAccounts': 'Saved accounts',
  'server.tapToEnter': 'Tap to enter',
  'server.useOtherAccount': 'Sign in with another account',
  'server.signingIn': 'Signing in…',
  'server.quickConnect': 'Sign in with Quick Connect',
  'server.quickConnectGuide':
    'On a signed-in device, open the web app and go to Settings → Quick Connect, then enter this code',
  'server.waitingApproval': 'Waiting for approval…',
};
