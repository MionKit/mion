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
        // AOT registration side effects
        expect(content).toMatch(/addAOTCaches/);
        expect(content).toMatch(/addRoutesToCache/);
        // Caches must be non-empty objects (not `= {}`)
        expect(content).toMatch(/const pureFnsCache = \{[\s\S]*?"mion"/);
        expect(content).toMatch(/const jitFnsCache = \{[\s\S]*?namespace:/);
        expect(content).toMatch(/const routerCache = \{[\s\S]*?"sayHello"/);
        // Server pure functions should be inlined with actual function data
        expect(content).toMatch(/serverPureFnsCache/);
        expect(content).toMatch(/Hello from pure fn!/);
    });
});
