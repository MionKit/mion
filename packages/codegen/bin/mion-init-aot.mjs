#!/usr/bin/env node

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mionInitAot} from '../.dist/esm/src/cli-init-aot.js';

try {
  mionInitAot();
} catch (error) {
  console.error('Error: Could not load mion-init-aot CLI.');
  console.error('Make sure the codegen package has been built with: npm run build');
  console.error('Details:', error.message);
  process.exit(1);
}
