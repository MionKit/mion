/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {buildTestBundle} from '../test-server/buildTestBundle.ts';

/** Rebuilds the workers bundle cloudflareHandler.workers.spec.ts loads into miniflare. */
export default async function setup(): Promise<void> {
    await buildTestBundle('cloudflare');
}
