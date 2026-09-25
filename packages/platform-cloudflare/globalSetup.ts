/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTestBundle} from '../private-test-server/buildTestBundle.ts';

/** `cloudflare-storage` is a MODULES worker: a service worker cannot export the Durable Object class its spec binds.
 *  Named export, not default: vitest ignores a `teardown` export when a default exists. */
export async function setup(): Promise<void> {
  await buildTestBundle('cloudflare');
  await buildTestBundle('cloudflare-storage');
}

/** Removes the genDirs the bundle builds wrote; safe, all project teardowns run after the whole run. */
export async function teardown(): Promise<void> {
  const here = fileURLToPath(new URL('.', import.meta.url));
  await rm(resolve(here, '../private-test-server/.mion-cloudflare'), {recursive: true, force: true});
  await rm(resolve(here, '../private-test-server/.mion-cloudflare-storage'), {recursive: true, force: true});
}
