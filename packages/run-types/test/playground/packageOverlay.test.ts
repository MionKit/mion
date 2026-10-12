/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {readFileSync} from 'node:fs';
import {relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {buildRuntypesOverlay, OVERLAY_INPUTS} from '../../../../scripts/website/playground-overlay.mjs';

// A subpath missing from the overlay makes the playground report "produced no call site" for snippets importing it.
const PACKAGE_DIR = new URL('../../', import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const VIRTUAL_ROOT = 'node_modules/@mionjs/run-types';

describe('playground source overlay', () => {
  const overlay = buildRuntypesOverlay(fileURLToPath(new URL('src/', PACKAGE_DIR)));
  const virtualPackage = JSON.parse(overlay[`${VIRTUAL_ROOT}/package.json`]);
  const realExports = JSON.parse(readFileSync(new URL('package.json', PACKAGE_DIR), 'utf8')).exports;

  it('exposes every subpath the real package exports, at its source file', () => {
    expect(Object.keys(virtualPackage.exports)).toEqual(Object.keys(realExports));
    expect(virtualPackage.exports['./mocking']).toBe('./src/mocking/index.ts');
  });

  it('carries the file behind every exported subpath', () => {
    for (const target of Object.values(virtualPackage.exports) as string[]) {
      expect(overlay[`${VIRTUAL_ROOT}/${target.slice(2)}`], target).toBeTypeOf('string');
    }
  });

  // build-playground.mjs only rebuilds the overlay when one of these changed, so each file it reads must be listed.
  it('lists every file it reads as a rebuild input', () => {
    const reads = [
      new URL('src', PACKAGE_DIR),
      new URL('package.json', PACKAGE_DIR),
      new URL('../../../../scripts/website/playground-overlay.mjs', import.meta.url),
    ];
    for (const read of reads) expect(OVERLAY_INPUTS).toContain(relative(REPO_ROOT, fileURLToPath(read)));
  });
});
