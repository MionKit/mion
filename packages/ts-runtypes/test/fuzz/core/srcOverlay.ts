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
// The resolver-lane fixtures follow the rule fully: their format / not /
// structural / oneOf spellings IMPORT the shipped brands (typeGen's
// FUZZ_FORMAT_PREAMBLE + FORMATS_OVERLAY below), so nothing is restated.
// The deliberate exceptions, all declared so the next reader can tell them
// from an accident, are the fixtures that physically cannot import:
//
// 1. `FUZZ_FORMAT_SCRATCH_PREAMBLE` (typeGen.ts) — the enrich / typemod
//    fixtures are scratch temp dirs with no ts-runtypes install, so they
//    carry a local `TF` namespace restating the param brands' raw sentinel
//    encoding (content-free, no per-format grammar). Pinned against the
//    shipped brands by scratchFormatPreamble.test.ts.
// 2. `i18nModel.ts`'s inline `TypeFormat` spelling — same temp-dir
//    constraint. Pinned by i18nInlineSpelling.test.ts.
// 3. `RUNTYPES_DTS` (ts-runtypes-devtools/test/helpers/inline.ts) — the
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
