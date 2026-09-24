/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared by the three drift servers: each runs in its own process, so every server has its own counts.

import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';

/** How many times each handler ran on this server: a refused call must leave its count alone. */
export const handlerCalls: Record<string, number> = {};

export function count(id: string): void {
  handlerCalls[id] = (handlerCalls[id] ?? 0) + 1;
}

export function listen(port: number) {
  setNodeHttpOpts({port});
  return startNodeServer();
}
