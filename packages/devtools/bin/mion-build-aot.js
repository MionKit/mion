#!/usr/bin/env node

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

const {join} = require('path');
const {mionBuildAot} = require('../.dist/cjs/src/codegen/cli-build-aot.js');
const templateDir = join(__dirname, '..', 'mion-aot-template');

mionBuildAot(templateDir).catch((error) => {
  console.error('Error: Could not load mion-build-aot CLI.');
  console.error('Make sure the devtools package has been built with: npm run build');
  console.error('Details:', error.message);
  process.exit(1);
});
