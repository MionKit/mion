/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Builds the REAL client through the REAL preset and reads the artifact, so a promise the source
// makes and the bundler ignores cannot pass here.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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

// The same app with metadata fetching set up.
const FETCHING_APP = `import {initClient} from '${path.join(packageRoot, 'index.ts')}';
import {useMethodsMetadata} from '${path.join(packageRoot, 'middlewares.ts')}';
const {routes, middlewares} = initClient<any>({baseURL: 'http://localhost:3000'});
useMethodsMetadata(middlewares.mionMethodsMetadata);
export const call = () => routes.sayHello({name: 'a', surname: 'b'}).call();
`;

type Mode = 'bundled' | 'mixed' | false;
const MODES: Mode[] = [false, 'bundled', 'mixed'];

/** Names only the fetched lane puts in an artifact. */
const LANE_MARKERS = ['indexedDB', 'mion:client', 'requestIdleCallback'];

/** The lane's own code: unlike the store key, which every build carries, these say which chunk holds it. */
const LANE_CODE_MARKERS = ['indexedDB', 'requestIdleCallback'];

/** Names only the per-route version recovery puts in an artifact; the check itself is in every build. */
const RECOVERY_MARKERS = ['rowsAgree', 'staleRoutesError'];

/** Names only the bundled-API REGISTRATION puts in an artifact; the light half is in every build. */
const BUNDLED_API_MARKERS = ['bundle-api-invalid-payload', 'bundledMethodToCacheEntry'];

const MIDDLEWARES_APP = `import {initClient} from '${path.join(packageRoot, 'index.ts')}';
import * as installers from '${path.join(packageRoot, 'middlewares.ts')}';
const {middlewares} = initClient<any>({baseURL: 'http://localhost:3000'});
export const app = {installers, middlewares};
`;

/** Names only the route sync installer puts in an artifact. */
const SYNC_MARKERS = ['useSyncRoutes', 'routeSyncIds', 'route-sync-required', 'route-types-mismatch'];

/** Names only the router puts in an artifact. */
const ROUTER_MARKERS = ['createMionRouter has already been called', 'mion router initialized'];

/** Names only the mock generator and the built-in pattern table put in an artifact. */
const MOCK_MARKERS = ['createMockDataFn', 'mockStringFormat', 'mockBoundedDateTime', 'registerMockingFunction'];
const PATTERN_MARKERS = ['DOMAIN_PUNYCODE_PATTERN', 'RELATIVE_JSON_POINTER_PATTERN'];

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mion-client-bundle-split-'));
  writeFileSync(path.join(root, 'app.ts'), APP);
  writeFileSync(path.join(root, 'fetching-app.ts'), FETCHING_APP);
  writeFileSync(path.join(root, 'middlewares-app.ts'), MIDDLEWARES_APP);
});

afterAll(() => rmSync(root, {recursive: true, force: true}));

type Chunk = {type: string; code?: string; fileName: string; isEntry?: boolean; imports?: string[]};

async function buildChunks(bundleApi?: Mode, entry = 'app.ts'): Promise<Chunk[]> {
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
      lib: {entry: path.join(root, entry), formats: ['es'], fileName: 'app'},
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {output: Chunk[]}[];
  return outputs.flatMap((out) => out.output ?? []).filter((chunk) => chunk.type === 'chunk');
}

/** Every chunk concatenated: a lane split into its own chunk is still shipped. */
async function buildApp(bundleApi?: Mode, entry = 'app.ts'): Promise<string> {
  return (await buildChunks(bundleApi, entry)).map((chunk) => chunk.code ?? '').join('\n');
}

/** What a browser runs before the first call: the entry and everything it imports statically. */
async function buildEagerApp(bundleApi?: Mode, entry = 'app.ts'): Promise<string> {
  const chunks = await buildChunks(bundleApi, entry);
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

// Only a client that sets up useMethodsMetadata ships the lane, and even then no build downloads it up front.
describe('the fetched metadata lane', () => {
  it('a client that never sets up useMethodsMetadata ships none of it, in every mode', async () => {
    for (const mode of MODES) {
      const code = await buildApp(mode);
      for (const marker of LANE_CODE_MARKERS) expect(code, `${mode}: ${marker}`).not.toContain(marker);
    }
  }, 360_000);

  it('a client that sets it up ships it, loaded on the first call and not before, in every mode', async () => {
    for (const mode of MODES) {
      const [all, eager] = [await buildApp(mode, 'fetching-app.ts'), await buildEagerApp(mode, 'fetching-app.ts')];
      for (const marker of LANE_MARKERS) expect(all, `${mode}: ${marker}`).toContain(marker);
      for (const marker of LANE_CODE_MARKERS) expect(eager, `${mode}: ${marker}`).not.toContain(marker);
    }
  }, 360_000);
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

  it('carries no bundled-API registration when bundleApi is off', async () => {
    const code = await buildApp(false);
    for (const marker of BUNDLED_API_MARKERS) expect(code, marker).not.toContain(marker);
  }, 120_000);

  it('a bundleApi build, the default, still gets the real registration', async () => {
    const code = await buildApp();
    for (const marker of BUNDLED_API_MARKERS) expect(code, marker).toContain(marker);
  }, 120_000);
});

// The version check reads every response's header, so it cannot load on demand.
// The per-route recovery rides the fetch's chunk: both run only once the bundle comes up short.
describe('the api version check', () => {
  it('keeps only the comparison in the first download, in every mode', async () => {
    for (const mode of MODES) {
      const [all, eager] = [await buildApp(mode, 'fetching-app.ts'), await buildEagerApp(mode, 'fetching-app.ts')];
      for (const marker of RECOVERY_MARKERS) expect(all, `${mode}: ${marker}`).toContain(marker);
      for (const marker of RECOVERY_MARKERS) expect(eager, `${mode}: ${marker}`).not.toContain(marker);
    }
  }, 360_000);

  it('ships the recovery in the same chunk as the fetch, so one download covers both', async () => {
    const chunks = await buildChunks('bundled', 'fetching-app.ts');
    const withRecovery = chunks.filter((chunk) => (chunk.code ?? '').includes('rowsAgree'));
    expect(withRecovery).toHaveLength(1);
    for (const marker of LANE_CODE_MARKERS) expect(withRecovery[0].code ?? '', marker).toContain(marker);
  }, 240_000);

  it('a client without metadata fetching ships no recovery at all', async () => {
    const code = await buildApp();
    for (const marker of RECOVERY_MARKERS) expect(code, marker).not.toContain(marker);
  }, 240_000);
});

describe('the @mionjs/client/middlewares entry', () => {
  it('ships its installers without any router code', async () => {
    const code = (await buildChunks(undefined, 'middlewares-app.ts')).map((chunk) => chunk.code ?? '').join('\n');
    for (const marker of ROUTER_MARKERS) expect(code, marker).not.toContain(marker);
  }, 240_000);

  it('ships the route sync installer', async () => {
    const code = (await buildChunks(undefined, 'middlewares-app.ts')).map((chunk) => chunk.code ?? '').join('\n');
    for (const marker of SYNC_MARKERS) expect(code, marker).toContain(marker);
  }, 240_000);

  it('the router markers are real: they are in the router source', () => {
    const routerSource = readFileSync(path.join(packageRoot, '../rpc-router/src/router.ts'), 'utf8');
    for (const marker of ROUTER_MARKERS) expect(routerSource, marker).toContain(marker);
  });
});

describe('route sync', () => {
  it('a client that never installs it ships none of it, in every mode', async () => {
    for (const mode of MODES) {
      const code = await buildApp(mode);
      for (const marker of SYNC_MARKERS) expect(code, `${mode}: ${marker}`).not.toContain(marker);
    }
  }, 360_000);

  it('the sync markers are real: they are in the installer source', () => {
    const source = readFileSync(path.join(packageRoot, 'src/middlewares/syncRoutes.ts'), 'utf8');
    for (const marker of SYNC_MARKERS) expect(source, marker).toContain(marker);
  });
});
