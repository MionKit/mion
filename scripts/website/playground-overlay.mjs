// Builds the ts-runtypes source overlay the playground resolver type-checks user
// snippets against: a `{ virtualPath -> content }` map staging the REAL package
// sources onto the resolver's virtual disk as a `node_modules/@ts-runtypes/core/`
// tree. The scoped name MUST match marker.DefaultModule ("@ts-runtypes/core") or
// the resolver's marker scanner won't recognize the injection markers (empty
// entryModules → the playground's cache column renders nothing).
//
// Single source of truth for two consumers (they MUST produce byte-identical
// overlays, or the browser playground and the Node tests would diverge):
//   - container/website/scripts/build-playground.mjs writes it to
//     runtypes-sources.json for the browser to fetch.
//   - packages/ts-runtypes/test/playground/nodeResolver.ts builds it in-memory
//     and injects it via setRuntypesPackageSources().
//
// Ported from the former packages/runtypes-playground/src/core/runtypesPackageSources.ts
// glob (query:'?raw'). A CUSTOM minimal package.json points the exports DIRECTLY
// at the `.ts` sources (unconditional), so bare bundler resolution +
// allowImportingTsExtensions finds them without a `source` custom condition.

import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, sep} from 'node:path';

// The virtual package.json — exports map points straight at the .ts sources.
const VIRTUAL_PACKAGE_JSON = JSON.stringify(
  {
    name: '@ts-runtypes/core',
    version: '0.0.0',
    exports: {
      '.': './src/index.ts',
      './schema': './src/schema/index.ts',
      './json-schema': './src/json-schema/index.ts',
      './formats': './src/formats/index.ts',
      './formats/temporal': './src/formats/datetime/temporalFormats.ts',
    },
  },
  null,
  2
);

function walkTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...walkTsFiles(abs));
    } else if (entry.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry)) {
      out.push(abs);
    }
  }
  return out;
}

// buildRuntypesOverlay maps every non-test .ts under `srcDir`
// (packages/ts-runtypes/src) to node_modules/@ts-runtypes/core/src/<rel> and adds
// the virtual package.json. Paths are POSIX-slashed so the overlay is identical on
// every OS.
export function buildRuntypesOverlay(srcDir) {
  const out = {};
  for (const abs of walkTsFiles(srcDir)) {
    const rel = relative(srcDir, abs).split(sep).join('/');
    out[`node_modules/@ts-runtypes/core/src/${rel}`] = readFileSync(abs, 'utf8');
  }
  out['node_modules/@ts-runtypes/core/package.json'] = VIRTUAL_PACKAGE_JSON;
  return out;
}

// CLI: `node scripts/website/playground-overlay.mjs <srcDir> <outFile>` writes the
// overlay JSON that container/website/scripts/build-playground.mjs serves to the
// browser. Run directly; the export above is what the Node playground tests import.
if (import.meta.main) {
  const [srcDir, outFile] = process.argv.slice(2);
  if (!srcDir || !outFile) {
    console.error('usage: node scripts/website/playground-overlay.mjs <srcDir> <outFile>');
    process.exit(2);
  }
  writeFileSync(outFile, JSON.stringify(buildRuntypesOverlay(srcDir)));
  console.error(`==> wrote ts-runtypes source overlay -> ${outFile}`);
}
