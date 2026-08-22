/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {buildTestBundle} from '../test-server/buildTestBundle.ts';

/** Rebuilds the edge bundle vercelHandler.edge.spec.ts loads into the EdgeVM. */
export default async function setup(): Promise<void> {
    await buildTestBundle('edge');
}
