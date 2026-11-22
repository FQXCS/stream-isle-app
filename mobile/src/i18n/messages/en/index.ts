/**
 * English messages aggregate. `satisfies Record<MessageKey, Message>` makes any missing
 * or misspelled key a compile error against the Chinese source of truth.
 */
import type { Message } from '@/i18n/types';
import type { MessageKey } from '@/i18n/messages/zh';

import { enBase } from './base';
import { enLibrary } from './library';
import { enPlayer } from './player';
import { enPlaylist } from './playlist';
import { enServer } from './server';

export const en = {
  ...enBase,
  ...enServer,
  ...enLibrary,
  ...enPlaylist,
  ...enPlayer,
} satisfies Record<MessageKey, Message>;
