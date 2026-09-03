/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTestBundle} from '../test-server/buildTestBundle.ts';

/** Rebuilds the edge bundle vercelHandler.edge.spec.ts loads into the EdgeVM.
 *  Named export, not default: vitest ignores a `teardown` export when a default exists. */
export async function setup(): Promise<void> {
  await buildTestBundle('edge');
}

/** The bundle build writes its runtypes genDir into test-server; remove it after the run
 *  (safe: all project teardowns run after the whole multi-project run finishes). */
export async function teardown(): Promise<void> {
  const here = fileURLToPath(new URL('.', import.meta.url));
  await rm(resolve(here, '../test-server/.mion-edge'), {recursive: true, force: true});
}
