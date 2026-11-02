/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {sql} from '@mionjs/drizzle-orm';
import type {ColumnShortcuts} from '@mionjs/drizzle-orm';

/** uuid `version`: drizzle has no such setting, so it replays as the default that generates that version. */
export const pgUuidShortcuts: ColumnShortcuts = {
  version: (version) => {
    if (version === '7') return ['default', [sql`uuidv7()`]];
    if (version === '4') return ['defaultRandom', true];
    throw new Error(`@mionjs/drizzle-orm-pg-core: uuid version takes '4' or '7', got ${String(version)}`);
  },
};

/** The type road's shortcuts, by builder fn. */
export const pgColumnShortcuts = {uuid: pgUuidShortcuts};
