/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ### IMPORTANT: This file is intended to be used to init the mion-aot using ts-node

import {join} from 'path';
import {mionInitAot} from './cli-init-aot.ts';

// Get template directory relative to this bin file
const templateDir = join(__dirname, '..', 'mion-aot-template');

try {
    mionInitAot(templateDir);
} catch (error: any) {
    console.error('Error: Could not load mion-init-aot CLI.');
    console.error('Make sure the codegen package has been built with: npm run build');
    console.error('Details:', error?.message);
    process.exit(1);
}
