/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeAll, afterAll, afterEach, vi} from 'vitest';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import {createServer as createHttpServer, type Server} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, createServer, type ViteDevServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {mionVitePlugin} from '../../src/vite/mionVitePlugin.ts';
import {createVirtualSiteMap, foldImportBlock} from '../../src/vite/sfcTransform.ts';
import {writeMarkerPackage} from '../helpers/inline.ts';
import {CLIENT_DTS, ROUTER_DTS, ROUTES} from '../helpers/batchFixture.ts';

// Typed mion code inside a .vue <script> used to be silently untransformed. These run the REAL
// pipeline — real vite, real @vitejs/plugin-vue, the real mion resolver — because the whole
// mechanism is about WHERE mion sits in it: later than plugin-vue and the generics are already
// erased by esbuild; earlier than its parse and there is no script yet.
//
// The assertion is always the one that fails without the SFC pass: the marker call in the EMITTED
// module receives its compiled fn. (esbuild renders the injected `undefined` args as `void 0`.)
const INJECTED = /createValidateFn\((?:undefined|void 0), (?:undefined|void 0), __rt_/;

// Under the package's gitignored `.tmp/`, not the OS temp dir: `vue` must resolve by walking up to node_modules.
// devtools does not depend on run-types, so each fixture gets the marker package written in.
const FIXTURE_ROOT = path.resolve(fileURLToPath(new URL('../../.tmp', import.meta.url)));

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    noEmit: true,
  },
  include: ['src/**/*.ts'],
});

const FILES: Record<string, string> = {
  'src/models.ts': `export type User = {name: string; age: number};\n`,
  // a real in-program site, so the resolver has something to scan before any SFC shows up
  'src/seed.ts': `import {createValidateFn} from '@mionjs/run-types';\nexport const seed = createValidateFn<{seeded: boolean}>();\n`,
  'src/Setup.vue': `<template><div>{{ ok }}</div></template>
<script setup lang="ts">
import {createValidateFn} from '@mionjs/run-types';
import type {User} from './models.ts';
const validateUser = createValidateFn<User>();
const ok = validateUser({name: 'Leo', age: 3});
</script>
`,
  'src/Classic.vue': `<template><div>classic</div></template>
<script lang="ts">
import {createValidateFn} from '@mionjs/run-types';
import type {User} from './models.ts';
export const validateUser = createValidateFn<User>();
export default {name: 'Classic'};
</script>
`,
  // both blocks: the type lives in <script>, the marker call in <script setup>. Vue merges them,
  // so mion registers them as ONE module — otherwise `Shared` would resolve to nothing.
  'src/Both.vue': `<template><div>both</div></template>
<script lang="ts">
export type Shared = {shared: string; count: number};
</script>
<script setup lang="ts">
import {createValidateFn} from '@mionjs/run-types';
const validateShared = createValidateFn<Shared>();
const ok = validateShared({shared: 'x', count: 1});
</script>
`,
  'src/Plain.vue': `<template><div>plain</div></template>
<script setup lang="ts">
const greeting: string = 'no mion code here';
</script>
`,
};

// The marker package is installed as types only, so vite resolves its runtime import to this stand-in.
const MARKER_STUB = `export const createValidateFn = () => () => true;\n`;
const markerAlias = (root: string) => ({alias: {'@mionjs/run-types': path.join(root, 'marker-stub.js')}});

/** Writes the fixture tree into a fresh directory and returns its root. */
function writeFixture(extra: Record<string, string> = {}): string {
  mkdirSync(FIXTURE_ROOT, {recursive: true});
  const root = mkdtempSync(path.join(FIXTURE_ROOT, 'sfc-'));
  mkdirSync(path.join(root, 'src'), {recursive: true});
  writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
  writeMarkerPackage(root);
  writeFileSync(path.join(root, 'marker-stub.js'), MARKER_STUB);
  for (const [name, content] of Object.entries({...FILES, ...extra})) {
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

/** A dev server running the mion plugin does not always finish closing (its resolver child
 *  and plugin-vue's watcher both outlive the call), and a hung teardown must not decide whether the
 *  assertions above passed. Bounded so the fixture is always cleaned up either way. */
async function closeQuietly(server: ViteDevServer | undefined): Promise<void> {
  if (!server) return;
  await Promise.race([server.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

/** `extra` adds aliases and preset options, for a fixture that also mounts an API. */
function devServer(
  root: string,
  sfc?: boolean,
  extra: {alias?: Record<string, string>; runTypes?: {genDir?: string}; server?: {entry: string}} = {}
): Promise<ViteDevServer> {
  return createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    resolve: {alias: {...markerAlias(root).alias, ...extra.alias}},
    server: {middlewareMode: true},
    plugins: [
      mionVitePlugin({tsConfig: path.join(root, 'tsconfig.json'), runTypes: {sfc, ...extra.runTypes}, server: extra.server}),
      vue(),
    ],
  });
}

describe('Vue SFC type transformation', () => {
  let root: string;
  let server: ViteDevServer;

  beforeAll(async () => {
    root = writeFixture();
    server = await devServer(root);
  }, 180_000);

  afterAll(async () => {
    await closeQuietly(server);
    rmSync(root, {recursive: true, force: true});
  }, 30_000);

  const moduleFor = async (name: string): Promise<string> => (await server.transformRequest(`/src/${name}`))?.code ?? '';

  /** The generated module a marker call was wired to, so a test can read the compiled body. */
  const generatedFor = (code: string): string => {
    const match = code.match(/from ["']([^"']*.mion\/types\/[^"']+)["']/);
    if (!match) return '';
    const file = match[1].replace(/\?.*$/, '');
    return readFileSync(file.startsWith('/') ? path.join(root, file) : file, 'utf8');
  };

  it('passes the compiled fn to a marker call in <script setup>', async () => {
    const code = await moduleFor('Setup.vue');
    expect(code).toMatch(INJECTED);
    expect(code).toMatch(/.mion\/types\//);
  });

  it('does the same for a classic <script>', async () => {
    expect(await moduleFor('Classic.vue')).toMatch(INJECTED);
  });

  it('resolves a type imported from a sibling .ts to its real shape', async () => {
    // not a degraded always-true validator: the emitted body checks the actual properties
    const generated = generatedFor(await moduleFor('Setup.vue'));
    expect(generated).toContain('User');
    expect(generated).toMatch(/typeof v\.name/);
    expect(generated).toContain('string');
    expect(generated).toMatch(/v\.age/);
  });

  it('registers <script> and <script setup> as one module, so types cross the blocks', async () => {
    const code = await moduleFor('Both.vue');
    expect(code).toMatch(INJECTED);
    const generated = generatedFor(code);
    expect(generated).toContain('Shared');
    expect(generated).toMatch(/v\.shared/);
    expect(generated).toMatch(/v\.count/);
  });

  it('leaves an SFC with no mion code alone, and never rewrites a file on disk', async () => {
    const before = readFileSync(path.join(root, 'src', 'Plain.vue'), 'utf8');
    expect(await moduleFor('Plain.vue')).not.toContain('__rt_');
    expect(readFileSync(path.join(root, 'src', 'Plain.vue'), 'utf8')).toBe(before);
    expect(readFileSync(path.join(root, 'src', 'Setup.vue'), 'utf8')).toBe(FILES['src/Setup.vue']);
  });

  it('keeps the script on its original lines, so plugin-vue source maps stay true', async () => {
    // the injected import block is folded onto the first line of the script instead of being
    // prepended as its own line — otherwise every line below the script shifts by one
    const result = await server.transformRequest('/src/Setup.vue');
    // vite types the map as `SourceMap | {mappings: ''}`; only the real one carries sources.
    const map = result?.map;
    const mapped = map && 'sourcesContent' in map ? map.sourcesContent?.[0] : undefined;
    expect(result?.code).toMatch(INJECTED);
    if (typeof mapped === 'string') {
      expect(mapped.split('\n').length).toBe(FILES['src/Setup.vue'].split('\n').length);
    }
  });
});

describe('Vue SFC transformation turned off', () => {
  let root: string;
  let server: ViteDevServer;
  const warnings: string[] = [];

  beforeAll(async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => warnings.push(String(args[0])));
    root = writeFixture();
    server = await devServer(root, false);
    await server.transformRequest('/src/Setup.vue');
    warn.mockRestore();
  }, 180_000);

  afterAll(async () => {
    await closeQuietly(server);
    rmSync(root, {recursive: true, force: true});
  }, 30_000);

  it('ships the SFC without its compiled fns', async () => {
    expect((await server.transformRequest('/src/Setup.vue'))?.code).not.toContain('__rt_');
  });

  it('says so loudly — a marker without its fns must never be silent', () => {
    expect(warnings.join('\n')).toMatch(/compiled WITHOUT its generated functions/);
  });
});

describe('Vue SFC diagnostics', () => {
  it('fails the build when a marker type comes from an unresolvable import', async () => {
    // a type imported from another .vue cannot be resolved by a TS program: marker-any-from-unresolved-import reports the
    // marker resolved to `any`, which would silently accept anything, so the build must stop
    const root = writeFixture({
      'src/Types.vue': `<script lang="ts">export type FromVue = {a: string};</script>\n`,
      'src/Broken.vue': `<template><div>x</div></template>
<script setup lang="ts">
import {createValidateFn} from '@mionjs/run-types';
import type {FromVue} from './Types.vue';
const validate = createValidateFn<FromVue>();
const ok = validate({a: 'x'});
</script>
`,
      'src/entry.ts': `import Broken from './Broken.vue';\nexport default Broken;\n`,
    });

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        resolve: markerAlias(root),
        build: {write: false, rollupOptions: {input: path.join(root, 'src', 'entry.ts')}},
        plugins: [mionVitePlugin({tsConfig: path.join(root, 'tsconfig.json')}), vue()],
      })
    ).rejects.toThrow(/build stopped|marker-any-from-unresolved-import/);

    rmSync(root, {recursive: true, force: true});
  }, 180_000);
});

// ############# type-dependency invalidation #############
// A .vue <script> reflecting a type from ANOTHER file, imported with `import type`, has no
// module-graph edge back to that file: the import is erased. Editing the type used to leave the
// SFC serving its previously compiled fn, validating the OLD shape, until the .vue file itself was
// touched. It never errored, it just accepted data the current type rejects.
//
// The runtypes plugin reports which site files went stale after an incremental update (its
// `onSiteFilesChanged` callback). mion's part is the translation: the SFC is registered under a
// VIRTUAL path (`Setup.vue.ts`) while the module vite serves is `Setup.vue`, so invalidating by
// the reported path alone would silently miss every .vue file.
//
// Two layers: the map is mion's own logic, and the end-to-end proof needs the transform to
// report stale sites at all. Both run unconditionally now.
//
// This used to sit behind a version probe (`upstreamReportsStaleSites`) that read the INSTALLED
// runtypes build and skipped the end-to-end block unless its source mentioned
// `onSiteFilesChanged`. The gate existed because the reporting shipped in a release newer than
// the version mion pinned. The two packages are one now, so there is no pin and no separate
// install to probe: either this package's own src reports stale sites or the suite should fail.
// A probe that can no longer answer "no" does not document a constraint, it hides one.

describe('virtual site map', () => {
  // mion's own half, and the piece upstream cannot test: it does not know that `Comp.vue.ts` is
  // a stand-in for `Comp.vue`. Runs against any installed version.
  it('resolves a virtual script path back to the real .vue file', () => {
    const map = createVirtualSiteMap();
    map.register('/project/src/Comp.vue.ts', '/project/src/Comp.vue');
    expect(map.resolve('/project/src/Comp.vue.ts')).toBe('/project/src/Comp.vue');
  });

  it('returns undefined for a path it never registered, so real site files pass through', () => {
    // The handler falls back to the reported path itself for these — a plain .ts site file is
    // already the module id vite serves, and must not be dropped.
    const map = createVirtualSiteMap();
    map.register('/project/src/Comp.vue.ts', '/project/src/Comp.vue');
    expect(map.resolve('/project/src/plain.ts')).toBeUndefined();
  });

  it('matches regardless of path separator', () => {
    // mion reports forward-slashed paths; mion builds its virtual path with node's
    // path.join, which is backslashed on Windows. A lookup that misses there would leave every
    // Windows .vue file stale while .ts files recovered.
    const map = createVirtualSiteMap();
    map.register('C:\\project\\src\\Comp.vue.ts', 'C:\\project\\src\\Comp.vue');
    expect(map.resolve('C:/project/src/Comp.vue.ts')).toBe('C:\\project\\src\\Comp.vue');
  });
});
describe('type-dependency invalidation', () => {
  let root = '';
  let server: ViteDevServer | undefined;

  beforeAll(async () => {
    root = writeFixture();
    server = await devServer(root);
  }, 180_000);

  afterAll(async () => {
    await closeQuietly(server);
    rmSync(root, {recursive: true, force: true});
  });

  it('re-injects a .vue script after its type changes in another file', async () => {
    const first = await server!.transformRequest('/src/Setup.vue');
    const firstId = /__rt_(\w+)/.exec(first?.code ?? '')?.[1];
    expect(firstId).toBeTruthy();

    // Add a required property, then tell vite the file changed — exactly what the watcher does.
    // `Setup.vue` is deliberately NOT touched: that is the whole point.
    const models = path.join(root, 'src/models.ts');
    writeFileSync(models, `export type User = {name: string; age: number; country: string};\n`);
    server!.watcher.emit('change', models);
    // handleHotUpdate is async and the watcher call is not awaited, so give it a beat to run
    // setSources -> scanFiles -> generate -> invalidate before re-requesting.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const second = await server!.transformRequest('/src/Setup.vue');
    const secondId = /__rt_(\w+)/.exec(second?.code ?? '')?.[1];
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  }, 180_000);
});

describe('import block fold', () => {
  const block = "import {__rt_A} from 'rtmod:/A.js';";

  it('folds a block at the top onto the first script line', () => {
    const source = '\nconst a = f();\n';
    expect(foldImportBlock(source, `${block}\n\nconst a = f(__rt_A);\n`)).toBe(`${block} \nconst a = f(__rt_A);\n`);
  });

  it('folds a block below a directive onto the line after it, leaving the directive line alone', () => {
    const source = "\n'use strict';\nconst a = f();\n";
    const transformed = `\n'use strict';\n${block}\nconst a = f(__rt_A);\n`;
    const folded = foldImportBlock(source, transformed);
    expect(folded).toBe(`\n'use strict';\n${block} const a = f(__rt_A);\n`);
    expect(folded.split('\n').length).toBe(source.split('\n').length);
  });
});

// The in-process API through the real preset, genDir outside the vite root (a Nuxt layout).
// A .vue-only batch registers when the page transforms and no watcher sees it, so the preset marks the API stale.
// An `import type`-only type is erased from the API graph; its edit rewrites a generated module the API does import.
describe('the in-process API under vite dev', () => {
  const SERVER = `import {createMionRouter} from '@mionjs/router';
import {createValidateFn} from '@mionjs/run-types';
import type {User} from './models.ts';
export const mion = createMionRouter();
mion.initRoutes({});
export const validateUser = createValidateFn<User>();
(globalThis as any).__apiLoads = ((globalThis as any).__apiLoads ?? 0) + 1;
export function httpRequestHandler(req: unknown, res: {end: (body: string) => void}): void {
  res.end(JSON.stringify({batches: Object.keys((globalThis as any).__table ?? {}), loads: (globalThis as any).__apiLoads}));
}
`;
  const PAGE = `<template><div>orders</div></template>
<script setup lang="ts">
import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
const both = batch([routes.users.getById(1), routes.orders.getById(2)]);
</script>
`;
  // Only what the middleware asks of the router, plus the table registrar the generated module calls.
  const ROUTER_STUB = `export const setHostOwnsSocket = () => {};
export const getHostRequestHandler = () => undefined;
export const getRouterOptions = () => ({});
export const getPlatformConfig = () => undefined;
export const createMionRouter = () => ({initRoutes: () => ({})});
export const replaceBatches = (table) => { globalThis.__table = table; };
`;
  const STUBS = {
    'router-stub.js': ROUTER_STUB,
    'core-stub.js': `export const registerInputMapperTuple = () => {};\n`,
    'client-stub.js': `export const batch = () => ({});\nexport const initClient = () => ({routes: {}});\n`,
  };
  let root = '';
  let server: ViteDevServer | undefined;
  let http: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
    await closeQuietly(server);
    rmSync(root, {recursive: true, force: true});
    rmSync(`${root}-gen`, {recursive: true, force: true});
    http = undefined;
    server = undefined;
    delete (globalThis as any).__table;
    delete (globalThis as any).__apiLoads;
  });

  async function startApi(): Promise<() => Promise<{batches: string[]; loads: number}>> {
    root = writeFixture({
      'src/client.d.ts': CLIENT_DTS,
      'src/router.d.ts': ROUTER_DTS,
      'src/routes.ts': ROUTES,
      'src/server.ts': SERVER,
      'src/Page.vue': PAGE,
      ...STUBS,
    });
    const stub = (name: string) => path.join(root, name);
    server = await devServer(root, undefined, {
      alias: {
        '@mionjs/router': stub('router-stub.js'),
        '@mionjs/core': stub('core-stub.js'),
        '@mionjs/client': stub('client-stub.js'),
      },
      runTypes: {genDir: `${root}-gen`},
      server: {entry: path.join(root, 'src/server.ts')},
    });
    const devServerInstance = server;
    http = createHttpServer((req, res) => devServerInstance.middlewares(req, res));
    await new Promise<void>((resolve) => http!.listen(0, resolve));
    const api = `http://127.0.0.1:${(http!.address() as {port: number}).port}/rpc`;
    return async () => (await fetch(api, {method: 'POST'})).json() as Promise<{batches: string[]; loads: number}>;
  }

  it('learns a batch first seen in a .vue file, with no file touched', async () => {
    const callApi = await startApi();
    expect((await callApi()).batches).toEqual([]);
    await server!.transformRequest('/src/Page.vue');
    expect((await callApi()).batches).toHaveLength(1);
  }, 180_000);

  it('reloads after an edit to a type it only imports with `import type`', async () => {
    const callApi = await startApi();
    expect((await callApi()).loads).toBe(1);
    const models = path.join(root, 'src/models.ts');
    writeFileSync(models, `export type User = {name: string; age: number; country: string};\n`);
    server!.watcher.emit('change', models);
    // the resolver re-scans asynchronously, as in the type-dependency test above
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect((await callApi()).loads).toBe(2);
  }, 180_000);
});
