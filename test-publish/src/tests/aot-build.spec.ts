/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {existsSync} from 'fs';
import {resolve} from 'path';

const rootDir = resolve(__dirname, '../..');

describe('AOT Build Verification', () => {
    it('should have built output in dist/', () => {
        const distDir = resolve(rootDir, 'dist');
        expect(existsSync(distDir)).toBe(true);
    });

    it('should have AOT cache file on disk', () => {
        // Default cache location: node_modules/.vite/mion-aot-cache.json
        const aotCachePath = resolve(rootDir, 'node_modules/.vite/mion-aot-cache.json');
        expect(existsSync(aotCachePath)).toBe(true);
    });
});
