/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {forkServer} from '../lib/serverProcess.ts';

export type DriftServerName = 'a' | 'b' | 'c';

/** One port for every server, so the client sees one address whose server changed. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const {port} = probe.address() as {port: number};
      probe.close(() => resolve(port));
    });
  });
}

/** Each server is a program of its own (tsconfig.drift-<name>.json), so its ids are what that build mints. */
export async function startDriftServer(name: DriftServerName, port: number): Promise<() => Promise<void>> {
  const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
  const server = await forkServer(`drift server ${name}`, [
    '--tsconfig',
    file(`../../tsconfig.drift-${name}.json`),
    '--entry',
    file(`./api${name.toUpperCase()}.ts`),
    '--start',
    'start',
    '--port',
    String(port),
  ]);
  return server.stop;
}
