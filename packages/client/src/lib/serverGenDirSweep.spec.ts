/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {mkdtemp, mkdir, writeFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sweepServerGenDir, SERVER_GEN_LEFTOVERS} from '../../globalSetup.ts';

// The client test run writes `.mion/rpc/batches.generated.js` into the managed server's root, and
// that module imports the client's generated mappers by absolute path. The shared teardown removes
// those mappers, so the module must go with them or the next server build fails on a dangling import.
describe('client run teardown sweeps the server genDir', () => {
  it('removes the RunTypes halves AND the batch module it wrote, nothing else', async () => {
    const serverGenDir = await mkdtemp(join(tmpdir(), 'mion-server-gen-'));
    for (const name of ['types', 'enriched', 'rpc', 'keep']) await mkdir(join(serverGenDir, name));
    await writeFile(join(serverGenDir, 'README.md'), '');
    await writeFile(join(serverGenDir, 'rpc', 'batches.generated.js'), 'import * as m from "/gone/pf/rt/x.js";');
    await writeFile(join(serverGenDir, 'keep', 'other.js'), '');

    await sweepServerGenDir(serverGenDir);

    expect(await readdir(serverGenDir)).toEqual(['keep']);
    expect(SERVER_GEN_LEFTOVERS).toContain('rpc');
    // idempotent: a second sweep over a clean dir is a no-op, never a throw
    await sweepServerGenDir(serverGenDir);
    expect(await readdir(serverGenDir)).toEqual(['keep']);
  });
});
