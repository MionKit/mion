/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeAll, afterAll, vi} from 'vitest';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, createServer, type ViteDevServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {mionVitePlugin} from './mionVitePlugin.ts';
import {createVirtualSiteMap} from './sfcTransform.ts';

// Typed mion code inside a .vue <script> used to be silently untransformed. These run the REAL
// pipeline — real vite, real @vitejs/plugin-vue, the real mion resolver — because the whole
// mechanism is about WHERE mion sits in it: later than plugin-vue and the generics are already
// erased by esbuild; earlier than its parse and there is no script yet.
//
// The assertion is always the one that fails without the SFC pass: the marker call in the EMITTED
// module receives its compiled fn. (esbuild renders the injected `undefined` args as `void 0`.)
const INJECTED = /createValidateFn\((?:undefined|void 0), (?:undefined|void 0), __rt_/;

// Fixtures live under the package (gitignored `.tmp/`), not in the OS temp dir: both vite and the
// mion program must resolve `vue` and `@mionjs/run-types` the way a real project does — by
// walking up to node_modules. A /tmp root resolves neither.
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

/** Writes the fixture tree into a fresh directory and returns its root. */
function writeFixture(extra: Record<string, string> = {}): string {
  mkdirSync(FIXTURE_ROOT, {recursive: true});
  const root = mkdtempSync(path.join(FIXTURE_ROOT, 'sfc-'));
  mkdirSync(path.join(root, 'src'), {recursive: true});
  writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
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

function devServer(root: string, sfc?: boolean): Promise<ViteDevServer> {
  return createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: {middlewareMode: true},
    plugins: [mionVitePlugin({runTypes: {tsConfig: path.join(root, 'tsconfig.json'), sfc}}), vue()],
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
    // a type imported from another .vue cannot be resolved by a TS program: MKR007 reports the
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
        build: {write: false, rollupOptions: {input: path.join(root, 'src', 'entry.ts')}},
        plugins: [mionVitePlugin({runTypes: {tsConfig: path.join(root, 'tsconfig.json')}}), vue()],
      })
    ).rejects.toThrow(/build halted|unsupported-type|MKR007/);

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
