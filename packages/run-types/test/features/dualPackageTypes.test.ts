// D2 regression guard: the published package must ship CJS-scoped declarations
// and split the `types` condition per module format, so a CommonJS-format TS
// consumer under `moduleResolution: nodenext` resolves the `require` types
// condition to `dist/cjs/**/*.d.ts` (read as CommonJS via the nested
// `{ "type": "commonjs" }` marker) instead of the ESM `dist/**/*.d.ts` — which
// raises TS1479 ("cannot be imported with require"). mion hit exactly this.
//
// This asserts the exports map SHAPE (always available) and, when the dist is
// built, that each referenced CJS declaration exists.

import {describe, expect, test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));

describe('dual-package types: per-condition ESM + CJS declarations (D2)', () => {
  const exportsMap = pkg.exports as Record<string, Record<string, unknown>>;

  test('every export entry splits `types` per condition (import -> ESM d.ts, require -> CJS d.ts)', () => {
    for (const [subpath, entry] of Object.entries(exportsMap)) {
      const imp = entry.import as {types?: string; default?: string} | undefined;
      const req = entry.require as {types?: string; default?: string} | undefined;
      expect(imp, `${subpath}: missing import condition`).toBeTruthy();
      expect(req, `${subpath}: missing require condition`).toBeTruthy();
      // ESM types come from dist/, CJS types from dist/cjs/.
      expect(imp!.types, `${subpath}: import.types must be an ESM (dist/) declaration`).toMatch(/^\.\/dist\/(?!cjs\/)/);
      expect(req!.types, `${subpath}: require.types must be a CJS (dist/cjs/) declaration`).toMatch(/^\.\/dist\/cjs\//);
      expect(req!.default, `${subpath}: require.default must be a CJS module`).toMatch(/^\.\/dist\/cjs\//);
    }
  });

  test('when built, every require.types CJS declaration exists on disk', () => {
    if (!fs.existsSync(path.join(PKG_DIR, 'dist/cjs'))) return; // source-only dev run
    for (const [subpath, entry] of Object.entries(exportsMap)) {
      const req = entry.require as {types?: string};
      const rel = req.types!;
      expect(fs.existsSync(path.join(PKG_DIR, rel)), `${subpath}: ${rel} must exist (CJS build must emit declarations)`).toBe(
        true
      );
    }
  });
});
