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

// Typed mion code inside a .vue <script> used to be silently untransformed. These run the REAL
// pipeline — real vite, real @vitejs/plugin-vue, the real ts-runtypes resolver — because the whole
// mechanism is about WHERE mion sits in it: later than plugin-vue and the generics are already
// erased by esbuild; earlier than its parse and there is no script yet.
//
// The assertion is always the one that fails without the SFC pass: the marker call in the EMITTED
// module receives its compiled fn. (esbuild renders the injected `undefined` args as `void 0`.)
const INJECTED = /createValidateFn\((?:undefined|void 0), (?:undefined|void 0), __rt_/;

// Fixtures live under the package (gitignored `.tmp/`), not in the OS temp dir: both vite and the
// ts-runtypes program must resolve `vue` and `@ts-runtypes/core` the way a real project does — by
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
    'src/seed.ts': `import {createValidateFn} from '@ts-runtypes/core';\nexport const seed = createValidateFn<{seeded: boolean}>();\n`,
    'src/Setup.vue': `<template><div>{{ ok }}</div></template>
<script setup lang="ts">
import {createValidateFn} from '@ts-runtypes/core';
import type {User} from './models.ts';
const validateUser = createValidateFn<User>();
const ok = validateUser({name: 'Leo', age: 3});
</script>
`,
    'src/Classic.vue': `<template><div>classic</div></template>
<script lang="ts">
import {createValidateFn} from '@ts-runtypes/core';
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
import {createValidateFn} from '@ts-runtypes/core';
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

/** A dev server running the ts-runtypes plugin does not always finish closing (its resolver child
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
        const match = code.match(/from ["']([^"']*__runtypes\/types\/[^"']+)["']/);
        if (!match) return '';
        const file = match[1].replace(/\?.*$/, '');
        return readFileSync(file.startsWith('/') ? path.join(root, file) : file, 'utf8');
    };

    it('passes the compiled fn to a marker call in <script setup>', async () => {
        const code = await moduleFor('Setup.vue');
        expect(code).toMatch(INJECTED);
        expect(code).toMatch(/__runtypes\/types\//);
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
        const mapped = result?.map?.sourcesContent?.[0];
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
import {createValidateFn} from '@ts-runtypes/core';
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
