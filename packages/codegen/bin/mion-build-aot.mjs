#!/usr/bin/env node

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mionBuildAot} from '../.dist/esm/cli-build-aot.js';

try {
  await mionBuildAot();
} catch (error) {
  console.error('Error: Could not load mion-build-aot CLI.');
  console.error('Make sure the codegen package has been built with: npm run build');
  console.error('Details:', error.message);
  process.exit(1);
}
