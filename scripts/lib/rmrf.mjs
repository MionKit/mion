#!/usr/bin/env node
// Zero-dependency `rm -rf` for the clean / fresh-start scripts — the replacement
// for the rimraf devDependency. Cross-platform (native fs.rmSync, so it works on
// Windows cmd.exe too); recursive + force, never throws on a missing path.
//
//   Usage:  node scripts/lib/rmrf.mjs <path> [path ...]

import {rmSync} from 'node:fs';

for (const target of process.argv.slice(2)) rmSync(target, {recursive: true, force: true});
