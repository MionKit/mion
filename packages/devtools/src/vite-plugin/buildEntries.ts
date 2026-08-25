/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {readdirSync, statSync} from 'fs';
import {resolve} from 'path';

// The ONE rule for what a mion package build ships: everything under src/ (plus
// the root index.ts) EXCEPT files carrying a test-lane suffix. Test files run
// from source via vitest; bench files via vitest bench; stub files are
// type-check-only (tsc --noEmit). Bundling any of them bloats the published
// dist — and when the runtypes plugin is present, drags their generated cache
// modules into it too (found as ~120 extra modules in @mionjs/router's dist,
// pulled in by two .bench.ts files).
export const TEST_FILE_SUFFIXES = ['.spec.ts', '.test.ts', '.bench.ts', '.stub.ts'] as const;

/** The same rule as dts/tsconfig exclude globs — keep the three lanes (rollup
 *  entries, d.ts emit, tsconfig.build.json program) agreeing on what ships. */
export const BUILD_EXCLUDE_GLOBS = ['**/*.spec.ts', '**/*.test.ts', '**/*.bench.ts', '**/*.stub.ts'] as const;

function isBuildSource(fileName: string): boolean {
  if (!fileName.endsWith('.ts') || fileName.endsWith('.d.ts')) return false;
  return !TEST_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function walkSourceFiles(dir: string, base = ''): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const file of readdirSync(dir)) {
    const fullPath = resolve(dir, file);
    const relativePath = base ? `${base}/${file}` : file;
    if (statSync(fullPath).isDirectory()) {
      Object.assign(entries, walkSourceFiles(fullPath, relativePath));
    } else if (isBuildSource(file)) {
      entries[relativePath.replace(/\.ts$/, '')] = fullPath;
    }
  }
  return entries;
}

/** Rollup lib entries for a standard mion package build: `<packageDir>/index.ts`
 *  plus every shippable file under `<packageDir>/src` (see TEST_FILE_SUFFIXES). */
export function collectBuildEntries(packageDir: string): Record<string, string> {
  const srcEntries = walkSourceFiles(resolve(packageDir, 'src'));
  return {
    index: resolve(packageDir, 'index.ts'),
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/${name}`, path])),
  };
}
