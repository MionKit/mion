// Which file authors each benchmark GROUP's cases.
//
// The benchmark pages render one chart per group and link that group's cases on
// GitHub, so every emitted section carries a `source`. One resolver serves both
// generators (gen-docs for the validation datasets, gen-serialization for the
// serialization ones) because both lay their cases out the same way: one
// PascalCase file per group, or an index.ts for a group authored as a whole
// directory (realworld, strict).
//
// It returns the FILE NAME, not a path: gen-serialization runs inside the benchmark
// image where the suite is mounted under the marker package, nowhere near its repo
// path, so the repo-relative prefix is the caller's to supply.
//
// It THROWS on a group it cannot place. A missing source would ship a chart whose
// link goes nowhere, and the point of resolving it here - rather than hand-writing
// the links on the pages - is that a renamed or moved case file breaks the run
// instead of rotting quietly.

import fs from 'node:fs';
import path from 'node:path';

/** UPPER_SNAKE group name -> PascalCase file basename ('CIRCULAR_REFS' -> 'CircularRefs'). */
export function groupToFile(group) {
  return group
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/** Does this file author the group? A file that merely re-exports it (an index that
 *  imports the real one) does not count, so the link lands on the samples. */
function declaresGroup(file, group) {
  if (!fs.existsSync(file)) return false;
  return new RegExp(`^export const ${group}\\b`, 'm').test(fs.readFileSync(file, 'utf8'));
}

/** The name of the file in `dir` that declares `group`: its own PascalCase file
 *  (matched case-insensitively, the names are not all exact), else index.ts. */
export function sourceFileIn(dir, group) {
  const wanted = `${groupToFile(group)}.ts`.toLowerCase();
  const named = fs.existsSync(dir) ? fs.readdirSync(dir).find((name) => name.toLowerCase() === wanted) : undefined;
  for (const candidate of [named, 'index.ts']) {
    if (candidate && declaresGroup(path.join(dir, candidate), group)) return candidate;
  }
  throw new Error(`no source file declares 'export const ${group}' in ${dir} (renamed or moved?)`);
}
