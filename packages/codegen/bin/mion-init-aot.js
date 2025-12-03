#!/usr/bin/env node

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

const {join} = require('path');
const {mionInitAot} = require('../.dist/cjs/src/cli-init-aot.js');

// Get template directory relative to this bin file
const templateDir = join(__dirname, '..', 'mion-aot-template');

try {
  mionInitAot(templateDir);
} catch (error) {
  console.error('Error: Could not load mion-init-aot CLI.');
  console.error('Make sure the codegen package has been built with: npm run build');
  console.error('Details:', error.message);
  process.exit(1);
}
