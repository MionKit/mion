/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The point of bundling the API: a client that ships every route it calls must not also ship the
// code that asks the server for one. This builds the REAL client through the REAL preset and reads
// the artifact, so it cannot pass on a promise the source makes and the bundler ignores.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

const packageRoot = path.resolve(__dirname, '..');

// Only what a client app writes: creating the client is what pulls the request path in.
const APP = `import {initClient} from '${path.join(packageRoot, 'index.ts')}';
const {routes} = initClient<any>({baseURL: 'http://localhost:3000'});
export const call = () => routes.sayHello({name: 'a', surname: 'b'}).call();
`;

/** Names only the fetched lane puts in an artifact: the browser database it opens, the key it opens
 *  it under, and the idle callback the deferred write rides. */
const LANE_MARKERS = ['indexedDB', 'mion:client', 'requestIdleCallback'];

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mion-client-bundle-split-'));
  writeFileSync(path.join(root, 'app.ts'), APP);
});

afterAll(() => rmSync(root, {recursive: true, force: true}));

/** Every chunk the build emitted, concatenated: a lane split into its own chunk is still shipped. */
async function buildApp(bundleApi?: 'bundled' | 'mixed'): Promise<string> {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: {conditions: ['source']},
    plugins: [
      mionVitePlugin({
        runTypes: {tsConfig: path.join(packageRoot, 'tsconfig.bundled.json'), genDir: path.join(root, '.mion')},
        bundleApi,
      }),
    ],
    build: {
      write: false,
      minify: false,
      lib: {entry: path.join(root, 'app.ts'), formats: ['es'], fileName: 'app'},
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {output: {type: string; code?: string}[]}[];
  return outputs
    .flatMap((out) => out.output ?? [])
    .filter((chunk) => chunk.type === 'chunk')
    .map((chunk) => chunk.code ?? '')
    .join('\n');
}

describe('the fetched metadata lane and the bundled API', () => {
  it('a client with no bundleApi still carries the lane', async () => {
    const code = await buildApp();
    for (const marker of LANE_MARKERS) expect(code, marker).toContain(marker);
  }, 120_000);

  it('a client built with bundleApi: bundled carries none of it', async () => {
    const code = await buildApp('bundled');
    for (const marker of LANE_MARKERS) expect(code, marker).not.toContain(marker);
  }, 120_000);

  it('a mixed client keeps the lane, because it still fetches what the build could not see', async () => {
    const code = await buildApp('mixed');
    for (const marker of LANE_MARKERS) expect(code, marker).toContain(marker);
  }, 120_000);
});
