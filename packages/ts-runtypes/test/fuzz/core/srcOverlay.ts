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
// The deliberate exceptions, all declared so the next reader can tell them
// from an accident:
//
// 1. `FUZZ_FORMAT_PREAMBLE` (typeGen.ts) — four aliases restating the raw
//    SENTINEL ENCODING the Go scanner reads. They are the independent
//    type-first oracle the translation is checked against; importing the
//    shipped brands there would compare a type with itself and the convergence
//    check would pass by construction. The encoding is content-free (no
//    per-format grammar), so there is nothing to drift — per-format leaves are
//    barred by the ADMISSION RULE on `FormatLeafName`.
// 2. The structural sentinel spellings inline in typeGen's `renderType`
//    (`__rtFormatName: 'formattedArray' / 'formattedObject'`, `__rtContains`,
//    `__rtPatternProps`, `__rtPropNames`) — the same raw-encoding oracle as
//    (1), for the structural keyword brands (structural.ts). Same rationale,
//    same content-free shape.
// 3. `i18nModel.ts`'s inline `TypeFormat` spelling — its fixtures are scratch
//    temp dirs with no ts-runtypes install, so a relative import cannot
//    resolve. Pinned against the shipped encoding by
//    i18nInlineSpelling.test.ts so drift fails loudly instead of silently
//    testing a plain string.
// 4. `RUNTYPES_DTS` (ts-runtypes-devtools/test/helpers/inline.ts) — the
//    hand-written `declare module '@ts-runtypes/core'` every harness loads.
//    The largest copy of all; generating it from source is its own design
//    problem (docs/todos/generate-runtypes-dts.md).
//
// Everywhere else, use the original.

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
