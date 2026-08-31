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

export function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {cwd: REPO_ROOT, maxBuffer: 1e9}).toString();
  return out.split(NUL).filter(Boolean);
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
