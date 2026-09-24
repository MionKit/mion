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

/** The lane's own code: unlike the store key, which every build carries, these say which chunk holds it. */
const LANE_CODE_MARKERS = ['indexedDB', 'requestIdleCallback'];

/** Names only the version-mismatch recovery puts in an artifact; the check itself is in every build. */
const RECOVERY_MARKERS = ['api-version-mismatch', 'rowsAgree', 'clientRowsAgree'];

/** Names only the bundled-API REGISTRATION puts in an artifact; the light half is in every build. */
const BUNDLED_API_MARKERS = ['bundle-api-invalid-payload', 'bundledMethodToCacheEntry'];

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

// Every build ships the lane: any client can come up short, a route the build never saw or a server that moved on.
// What changes is when it is downloaded, and no build downloads it up front.
describe('the fetched metadata lane', () => {
  it('a client with no bundleApi loads it on the first call, not before', async () => {
    const [all, eager] = [await buildApp(), await buildEagerApp()];
    for (const marker of LANE_MARKERS) expect(all, marker).toContain(marker);
    for (const marker of LANE_CODE_MARKERS) expect(eager, marker).not.toContain(marker);
  }, 240_000);

  it('a bundled client still ships it, for the call its bundle cannot answer', async () => {
    const [all, eager] = [await buildApp('bundled'), await buildEagerApp('bundled')];
    for (const marker of LANE_MARKERS) expect(all, marker).toContain(marker);
    for (const marker of LANE_CODE_MARKERS) expect(eager, marker).not.toContain(marker);
  }, 240_000);

  it('a mixed client splits it the same way', async () => {
    const [all, eager] = [await buildApp('mixed'), await buildEagerApp('mixed')];
    for (const marker of LANE_MARKERS) expect(all, marker).toContain(marker);
    for (const marker of LANE_CODE_MARKERS) expect(eager, marker).not.toContain(marker);
  }, 240_000);
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

// The version check reads one header per response, so it cannot be loaded on demand; what a mismatch then
// does rides the fetch's chunk, since both run only once the bundle comes up short.
describe('the api version check', () => {
  it('keeps only the comparison in the first download, in every mode', async () => {
    for (const mode of [undefined, 'bundled', 'mixed'] as const) {
      const [all, eager] = [await buildApp(mode), await buildEagerApp(mode)];
      for (const marker of RECOVERY_MARKERS) expect(all, `${mode}: ${marker}`).toContain(marker);
      for (const marker of RECOVERY_MARKERS) expect(eager, `${mode}: ${marker}`).not.toContain(marker);
    }
  }, 360_000);

  it('ships the recovery in the same chunk as the fetch, so one download covers both', async () => {
    const chunks = await buildChunks('bundled');
    const withRecovery = chunks.filter((chunk) => (chunk.code ?? '').includes('api-version-mismatch'));
    expect(withRecovery).toHaveLength(1);
    for (const marker of LANE_CODE_MARKERS) expect(withRecovery[0].code ?? '', marker).toContain(marker);
  }, 240_000);
});
