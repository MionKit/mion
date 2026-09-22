/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Builds the REAL client through the REAL preset and reads the artifact, so a promise the source
// makes and the bundler ignores cannot pass here.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

const packageRoot = path.resolve(__dirname, '..');

// Creating the client is what pulls the request path in.
const APP = `import {initClient} from '${path.join(packageRoot, 'index.ts')}';
const {routes} = initClient<any>({baseURL: 'http://localhost:3000'});
export const call = () => routes.sayHello({name: 'a', surname: 'b'}).call();
`;

/** Names only the fetched lane puts in an artifact. */
const LANE_MARKERS = ['indexedDB', 'mion:client', 'requestIdleCallback'];

/** Names only the bundled-API REGISTRATION puts in an artifact; the light half is in every build. */
const BUNDLED_API_MARKERS = ['bundle-api-invalid-payload', 'bundledMethodToCacheEntry'];

/** Names only the version-mismatch recovery puts in an artifact; the check itself is in every build. */
const RECOVERY_MARKERS = ['api-version-mismatch', 'rowsAgree', 'COMPARED_OPTIONS'];

/** Names only the mock generator and the built-in pattern table put in an artifact. */
const MOCK_MARKERS = ['createMockDataFn', 'mockStringFormat', 'mockBoundedDateTime', 'registerMockingFunction'];
const PATTERN_MARKERS = ['DOMAIN_PUNYCODE_PATTERN', 'RELATIVE_JSON_POINTER_PATTERN'];

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mion-client-bundle-split-'));
  writeFileSync(path.join(root, 'app.ts'), APP);
});

afterAll(() => rmSync(root, {recursive: true, force: true}));

type Chunk = {type: string; code?: string; fileName: string; isEntry?: boolean; imports?: string[]};

async function buildChunks(bundleApi?: 'bundled' | 'mixed'): Promise<Chunk[]> {
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
  const outputs = (Array.isArray(result) ? result : [result]) as {output: Chunk[]}[];
  return outputs.flatMap((out) => out.output ?? []).filter((chunk) => chunk.type === 'chunk');
}

/** Every chunk concatenated: a lane split into its own chunk is still shipped. */
async function buildApp(bundleApi?: 'bundled' | 'mixed'): Promise<string> {
  return (await buildChunks(bundleApi)).map((chunk) => chunk.code ?? '').join('\n');
}

/** What a browser runs before the first call: the entry and everything it imports statically. */
async function buildEagerApp(bundleApi?: 'bundled' | 'mixed'): Promise<string> {
  const chunks = await buildChunks(bundleApi);
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const eager = new Set<string>();
  const walk = (name: string): void => {
    if (eager.has(name)) return;
    eager.add(name);
    for (const next of byName.get(name)?.imports ?? []) walk(next);
  };
  for (const chunk of chunks) if (chunk.isEntry) walk(chunk.fileName);
  return [...eager].map((name) => byName.get(name)?.code ?? '').join('\n');
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

// Mock generation and the pattern table used to reach every client through @mionjs/core's formats
// import, ~6.5 kB gzipped a browser never runs; only the artifact proves they are gone.
describe('what a default client leaves out', () => {
  it('carries no mock generation', async () => {
    const code = await buildApp();
    for (const marker of MOCK_MARKERS) expect(code, marker).not.toContain(marker);
  }, 120_000);

  it('carries no built-in pattern table', async () => {
    const code = await buildApp();
    for (const marker of PATTERN_MARKERS) expect(code, marker).not.toContain(marker);
  }, 120_000);

  it('carries no bundled-API registration, which only a bundleApi build can reach', async () => {
    const code = await buildApp();
    for (const marker of BUNDLED_API_MARKERS) expect(code, marker).not.toContain(marker);
  }, 120_000);

  it('a bundleApi build still gets the real registration', async () => {
    const code = await buildApp('bundled');
    for (const marker of BUNDLED_API_MARKERS) expect(code, marker).toContain(marker);
  }, 120_000);
});

// The version check reads one header per response, so it cannot be loaded on demand. Everything a
// mismatch then does can, and a client that never meets one must never download it.
describe('what the api version check leaves out of the first download', () => {
  it('a bundled client ships the recovery code, but not before the first call', async () => {
    const [all, eager] = [await buildApp('bundled'), await buildEagerApp('bundled')];
    for (const marker of RECOVERY_MARKERS) expect(all, marker).toContain(marker);
    for (const marker of RECOVERY_MARKERS) expect(eager, marker).not.toContain(marker);
  }, 240_000);

  it('a mixed client splits it the same way', async () => {
    const [all, eager] = [await buildApp('mixed'), await buildEagerApp('mixed')];
    for (const marker of RECOVERY_MARKERS) expect(all, marker).toContain(marker);
    for (const marker of RECOVERY_MARKERS) expect(eager, marker).not.toContain(marker);
  }, 240_000);
});
