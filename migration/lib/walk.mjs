// The one tree walk. `scan`, `check`, `apply` and `verify` all reach every occurrence
// through this, so all four see an identical set of rows by construction.

import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {matchLine} from './match.mjs';
import {makeKinder} from './kind.mjs';
import {areaOf} from './area.mjs';
import {REPO_ROOT} from './shards.mjs';

const NUL = String.fromCharCode(0);

// The tool never scans ITSELF. Its shards are full of runtypes tokens by construction
// (they are the decisions ABOUT those tokens), so including them would both invent rows
// nobody decided about and rewrite the record of the migration mid-migration.
const SELF = 'migration/';

// Machine-owned output, skipped entirely rather than marked.
//
// This is an EXCLUSION and not a rule on purpose. Row keys are `token@kind@area`, which
// carries no file, so a rule that tests the file gets only the first file that happened
// to produce the row. One .snap file was enough to mark the whole
// `@ts-runtypes/core@import-spec@03-ts-devtools` row as `regenerate`, silently skipping
// 369 real sites across 57 test files. Generated-ness is a property of the FILE, so it
// has to be decided where the file is known.
//
// Each of these has a generator that must be re-run after a phase:
//   pnpm-lock.yaml   pnpm install
//   go-generated/    pnpm exec node scripts/core/gen-diagnostics-catalog.mjs
//   __snapshots__/   vitest -u
//
// testdata/ is deliberately NOT here: those fixtures are read as source by the Go suite
// and are rewritten like any other file.
const GENERATED = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)go-generated\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
];

export function isGenerated(file) {
  return GENERATED.some((pattern) => pattern.test(file));
}

export function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {cwd: REPO_ROOT, maxBuffer: 1e9}).toString();
  return out
    .split(NUL)
    .filter(Boolean)
    .filter((file) => !file.startsWith(SELF) && !isGenerated(file));
}

export function rowId(token, kind, area) {
  return `${token}@${kind}@${area}`;
}

// Calls back once per occurrence with everything a decision needs. `line`/`start`/`end`
// are what `apply` splices on; `id` is what the shards are keyed by.
export function walk(onHit) {
  for (const file of trackedFiles()) {
    let source;
    try {
      source = readFileSync(join(REPO_ROOT, file), 'utf8');
    } catch {
      // A submodule gitlink (ts-go-runtypes/third_party/*) reads as a directory. It is
      // not ours to rewrite, so skipping it is the correct outcome, not a gap.
      continue;
    }
    if (source.includes(NUL)) continue; // binary

    const area = areaOf(file);
    const kindOf = makeKinder(file);
    const lines = source.split('\n');

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      // Every line goes through kindOf, matched or not, so its markdown fence state
      // stays in step with the file.
      const hits = matchLine(line);
      for (const hit of hits) {
        const kind = kindOf(line, hit.start);
        onHit({
          file,
          area,
          kind,
          line,
          lineNumber,
          token: hit.token,
          start: hit.start,
          end: hit.end,
          id: rowId(hit.token, kind, area),
        });
      }
      if (hits.length === 0) kindOf(line, 0);
    }
  }
}
