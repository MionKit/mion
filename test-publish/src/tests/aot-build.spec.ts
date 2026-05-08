/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {existsSync, readFileSync} from 'fs';
import {resolve} from 'path';

const rootDir = resolve(__dirname, '../..');
const distFile = resolve(rootDir, 'dist/server.js');

describe('AOT Build Verification', () => {
    it('should have built output in dist/', () => {
        expect(existsSync(distFile)).toBe(true);
    });

    it('should have AOT caches inlined in build output', () => {
        const content = readFileSync(distFile, 'utf-8');
        // The combined virtual module is pure data; rollup inlines the named exports
        // and the consumer passes them via initMionRouter({ aotCaches }).
        expect(content).toMatch(/jitFnsCache/);
        expect(content).toMatch(/pureFnsCache/);
        expect(content).toMatch(/routerCache/);
        // Cache data should contain real entries (route ids and namespace strings)
        expect(content).toMatch(/"sayHello"/);
        expect(content).toMatch(/"mion"/);
        // Server pure functions should be inlined with actual function data
        expect(content).toMatch(/serverPureFnsCache/);
        expect(content).toMatch(/Hello from pure fn!/);
        // The user-facing API: caches are passed as an option, not auto-registered
        expect(content).toMatch(/aotCaches/);
    });

    it('should not contain the removed @mionjs/core/aot-caches shim path', () => {
        const content = readFileSync(distFile, 'utf-8');
        expect(content).not.toMatch(/@mionjs\/core\/aot-caches/);
    });
});
