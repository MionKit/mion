/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mionVitePlugin} from './mionVitePlugin.ts';

// The serverMapFrom transport used to be a `virtual:mion/server-mappers` module. Virtual modules lose
// to rollupOptions.external — rollup tests external against the RESOLVED id, and `\0virtual:…` still
// matches a catch-all like /^[^./]/ — so the import was externalized and survived verbatim into
// production bundles, where nothing resolves it, and the documented build-time inlining never
// happened. It is a real generated file now, and the plugin injects the import itself.

const ENTRY = `import {Routes, initMionRouter, route} from '@mionjs/router';\nawait initMionRouter({} as Routes);\n`;
const MAPPER = {key: 'rt::abc123', code: 'return (order) => order.userId;'};

/** Drives the plugin's hooks the way vite would, and returns what it generated/injected. */
function run(root: string, manifest: string, command: 'build' | 'serve', entryCode = ENTRY, entryDir = 'src') {
    const plugins = mionVitePlugin({serverMappers: {consume: manifest}}) as any[];
    const plugin = plugins.flat().find((p) => p?.name === 'mion-server-mappers');
    plugin.configResolved({root, command});
    plugin.buildStart.call({});
    const generatedFile = path.resolve(root, '.mion/server-mappers.generated.js');
    const entryId = path.resolve(root, entryDir, 'server.ts');
    return {
        plugin,
        generatedFile,
        generated: existsSync(generatedFile) ? readFileSync(generatedFile, 'utf8') : undefined,
        transformed: plugin.transform.call({}, entryCode, entryId),
    };
}

describe('serverMapFrom generated module', () => {
    let root: string;
    let manifest: string;

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'mion-mappers-'));
        manifest = path.join(root, 'harvested.json');
        writeFileSync(manifest, JSON.stringify([MAPPER]));
        mkdirSync(path.join(root, 'src'), {recursive: true});
    });
    afterEach(() => rmSync(root, {recursive: true, force: true}));

    it('writes a real file rather than serving a virtual module', () => {
        const {plugin, generated} = run(root, manifest, 'build');
        expect(generated).toBeDefined();
        // the failure mode being designed out: nothing to externalize, nothing to declare
        expect(plugin.resolveId).toBeUndefined();
        expect(plugin.load).toBeUndefined();
        expect(generated).not.toContain('virtual:');
    });

    it('inlines the manifest entries as static data in build mode', () => {
        const {generated} = run(root, manifest, 'build');
        expect(generated).toContain('registerServerMappers');
        expect(generated).toContain(MAPPER.key);
        expect(generated).toContain(MAPPER.code);
        // an artifact that reads a cache off disk at boot is not edge/lambda deployable
        expect(generated).not.toContain('node:fs');
    });

    it('installs the lazy re-reader in serve mode, covering the client-build race', () => {
        const {generated} = run(root, manifest, 'serve');
        expect(generated).toContain('installServerMapperReader');
        expect(generated).toContain(manifest);
        // the body must NOT be frozen in at config time — the client build may not have run yet
        expect(generated).not.toContain(MAPPER.code);
    });

    it('injects the import into the module that calls initMionRouter', () => {
        const {transformed, generatedFile} = run(root, manifest, 'build');
        expect(transformed.code).toMatch(/^import '\.\.\/\.mion\/server-mappers\.generated\.js';/);
        expect(transformed.code).toContain('initMionRouter');
        expect(existsSync(generatedFile)).toBe(true);
    });

    it('leaves modules that never touch the router alone', () => {
        const unrelated = `import {route} from '@mionjs/router';\nexport const r = route(() => 'x');\n`;
        expect(run(root, manifest, 'build', unrelated).transformed).toBeUndefined();
        // a mention in a comment is not an import
        expect(run(root, manifest, 'build', '// initMionRouter lives in @mionjs/router\n').transformed).toBeUndefined();
    });

    it('is not wired at all when no manifest is consumed', () => {
        const plugins = mionVitePlugin({}) as any[];
        expect(plugins.flat().find((p) => p?.name === 'mion-server-mappers')).toBeUndefined();
    });

    it('fails the build loudly when a consumed manifest is missing', () => {
        const plugins = mionVitePlugin({serverMappers: {consume: path.join(root, 'absent.json')}}) as any[];
        const plugin = plugins.flat().find((p) => p?.name === 'mion-server-mappers');
        plugin.configResolved({root, command: 'build'});
        // silently shipping a bundle with no mappers would only fail at request time
        expect(() => plugin.buildStart.call({})).toThrow(/manifest not found/);
    });
});
