/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Plugin} from 'vite';
import {writeFileSync} from 'fs';

/** Writes {"type": "commonjs"} package.json in CJS output dirs so Node.js doesn't treat .cjs files ambiguously */
export function cjsPackageJsonPlugin(...cjsDirs: string[]): Plugin {
    return {
        name: 'cjs-package-json',
        closeBundle() {
            for (const dir of cjsDirs) {
                writeFileSync(`${dir}/package.json`, '{"type":"commonjs"}\n');
            }
        },
    };
}
