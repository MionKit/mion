// emit-cjs-pkg.mjs — drop a `{ "type": "commonjs" }` marker package.json into a CJS
// dist subfolder. The package root is `type: module`, so every `.js` under it is ESM
// by default; this marker tells Node to treat the CommonJS build in that subfolder as
// CommonJS (so `require()` works). Used by @ts-runtypes/core's dual build.
//
// Usage: node scripts/lib/emit-cjs-pkg.mjs <dir>

import {mkdirSync, writeFileSync} from 'node:fs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/lib/emit-cjs-pkg.mjs <dir>');
  process.exit(2);
}
mkdirSync(dir, {recursive: true});
writeFileSync(`${dir}/package.json`, JSON.stringify({type: 'commonjs'}, null, 2) + '\n');
