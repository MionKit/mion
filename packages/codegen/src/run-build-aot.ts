/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ### IMPORTANT: This file is intended to be used to build the mion-aot using ts-node

import {mionBuildAot} from './cli-build-aot';
import {join} from 'path';

const templateDir = join(__dirname, '..', 'mion-aot-template');

mionBuildAot(templateDir).catch((error) => {
    console.error('Error: Could not load mion-build-aot CLI.');
    console.error('Make sure the codegen package has been built with: npm run build');
    console.error('Details:', error.message);
    process.exit(1);
});
