// The REAL `src/` tree, as a resolver overlay.
//
// The resolver's serve/ops mode builds its program from the overlay keys alone
// — a pure virtual filesystem — so a fuzz fixture cannot import the shipped
// sources off disk. The fix is not to hand-write stand-ins but to make the real
// tree BE the virtual filesystem: read it here and hand it over whole. `src/`
// imports nothing non-relative (its only bare specifiers live in comments), so
// the graph closes with no further stubs.
//
// This is what keeps the fuzz suites honest. A hand-written copy of a shipped
// type does not fail when the shipped type changes — it silently keeps testing
// the old shape, which is the one failure mode a fuzz suite cannot afford.
//
// The ONE deliberate exception is `FUZZ_FORMAT_PREAMBLE` (typeGen.ts): those
// `Fz*` aliases are the INDEPENDENT type-first oracle the translation is checked
// against. Importing the shipped types there would compare a type with itself
// and the convergence check would pass by construction. Independence is the
// point; everywhere else, use the original.

import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('../../../src', import.meta.url));

function readTree(dir: string, prefix: string, into: Record<string, string>): void {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) readTree(abs, `${prefix}${entry.name}/`, into);
    else if (entry.name.endsWith('.ts')) into[`src/${prefix}${entry.name}`] = readFileSync(abs, 'utf8');
  }
}

/** Every `src/**` file keyed by its path under `src/`, for `setSources`. Read
 *  once per process — the tree does not change mid-run. **/
export const SRC_OVERLAY: Readonly<Record<string, string>> = (() => {
  const overlay: Record<string, string> = {};
  readTree(SRC_ROOT, '', overlay);
  return overlay;
})();

/** Just the files a fixture needs to spell a brand with the SHIPPED
 *  `TypeFormat` — the alias plus the sentinel key symbols it imports. Cheaper
 *  than the whole tree for fuzzes that only need to synthesize arbitrary
 *  formats rather than exercise the format library. **/
export const TYPE_FORMAT_OVERLAY: Readonly<Record<string, string>> = {
  'src/runtypes/typeFormat.ts': SRC_OVERLAY['src/runtypes/typeFormat.ts'],
  'src/runtypes/sentinelKeys.ts': SRC_OVERLAY['src/runtypes/sentinelKeys.ts'],
};

/** The import a fixture writes to pull in the shipped `TypeFormat`. **/
export const TYPE_FORMAT_IMPORT = `import type {TypeFormat} from './src/runtypes/typeFormat.ts';`;
