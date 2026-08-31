/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {existsSync, readFileSync} from 'fs';
import {resolve} from 'path';

// Runs AFTER `vite build`, against the production bundle a consumer would deploy.
//
// This replaces the old "AOT Build Verification" spec, which asserted the bundle contained
// addAOTCaches / jitFnsCache / routerCache / serverPureFnsCache — every one of those symbols was
// deleted in the mion migration, so the spec could not pass, and it had been failing the
// whole release gate closed.
//
// The intent it was guarding is still worth guarding, just against the current engine: the types
// must be COMPILED INTO the bundle at build time. If injection silently no-ops, the server still
// starts and only fails later, per request, on the first validation.

const rootDir = resolve(__dirname, '../..');
const distFile = resolve(rootDir, 'dist/server.js');

describe('production build output', () => {
    it('builds dist/server.js', () => {
        expect(existsSync(distFile)).toBe(true);
    });

    it('inlines compiled mion fn bodies rather than deferring them to runtime', () => {
        const content = readFileSync(distFile, 'utf-8');
        // compiled fn bodies ship as code strings that resolve their helpers out of the pure-fn
        // registry — the shape @ts-runtypes emits for every validator/serializer it precompiles.
        expect(content).toMatch(/getPureFn\('rt::/);
        // ...each carrying its trailing pure-fn dependency-key array
        expect(content).toMatch(/\["rt::[^"]+"(, "rt::[^"]+")*\]/);
    });

    it('compiles the fixture routes, not just the library', () => {
        const content = readFileSync(distFile, 'utf-8');
        for (const routeName of ['sayHello', 'calculateAge', 'getCustomerById', 'getPreferencesById']) {
            expect(content, `route ${routeName} missing from the bundle`).toContain(routeName);
        }
    });

    it('inlines the serverMapFrom mappers harvested from the client build', () => {
        const content = readFileSync(distFile, 'utf-8');
        // The mapper body is authored in client flow code (src/tests/json.spec.ts), harvested into
        // .mion/server-mappers.json, and compiled into the generated module the plugin imports for us.
        // This used to be served as `virtual:mion/server-mappers`, which rollup externalized — the
        // bundle shipped an unresolvable `import "virtual:mion/server-mappers"` and the mappers never
        // travelled at all. Nothing virtual may survive into the artifact.
        // Every mapper here resolves to a generated pure-fn module, so it registers through the
        // tuple lane; registerServerMappers is the fallback for mappers that have no module, and
        // rollup tree-shakes that import when nothing calls it.
        expect(content).toContain('registerServerMapperTuple');
        expect(content).toContain('customerValue');
        expect(content).not.toContain('virtual:');
    });

    it('is self-contained — no cache file read from disk at runtime', () => {
        const content = readFileSync(distFile, 'utf-8');
        // an artifact that reads node:fs at boot is not deployable to edge/lambda
        expect(content).not.toContain('node:fs');
    });

    it('carries no residue of the deleted AOT/deepkit engine', () => {
        const content = readFileSync(distFile, 'utf-8');
        for (const gone of ['addAOTCaches', 'serverPureFnsCache', 'jitFnsCache', 'pureServerFn']) {
            expect(content, `${gone} is gone from mion — a bundle containing it means stale packages`).not.toContain(gone);
        }
    });
});
