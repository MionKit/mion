// D1 regression guard: the PUBLISHED declarations must never force the global
// `Temporal` namespace on a consumer. `formats/datetime/temporalFormats.ts` is
// imported by the root marker surface (via `builderTypes`), so a bare
// `Temporal.*` type reference anywhere in `dist/**/*.d.ts` makes every consumer
// on `lib: es2021` without `skipLibCheck` fail with TS2503 (~40 errors — mion
// hit exactly this). The Temporal instance types are guarded behind
// `TemporalInstanceOf<K>` (a `typeof globalThis extends {Temporal: …}`
// conditional that falls back to `unknown`), so the emitted `.d.ts` must carry
// ZERO `Temporal.` references outside comments.
//
// This reads the built dist; it is skipped when the dist is absent (a source-
// only dev run). `pnpm test` builds the dist first, so CI always exercises it.

import {describe, expect, test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

function collectDts(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectDts(full, out);
    else if (entry.name.endsWith('.d.ts')) out.push(full);
  }
}

// Strip comments AND string literals so only real REFERENCES are scanned.
//
// A mention in prose was never the hazard, and neither is a quoted name: the
// failure this guard exists for is TS2503 "cannot find namespace Temporal",
// which only a type reference can cause. A string literal cannot force a lib —
// `jsType: 'Temporal.Instant'` in the json-schema dialect's keyword union is
// text, not a reference, and scanning it would make the guard reject a
// perfectly safe declaration.
//
// Template literals are stripped too: the dialect's key map derives its
// qualified names with `` `Temporal.${Suffix}` ``, which is a template literal
// TYPE and equally inert.
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('published .d.ts does not force the Temporal lib (D1)', () => {
  const run = fs.existsSync(DIST) ? test : test.skip;

  run('no dist declaration references the `Temporal` namespace directly', () => {
    const files: string[] = [];
    collectDts(DIST, files);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const code = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (/\bTemporal\./.test(line)) offenders.push(`${path.relative(DIST, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `bare Temporal.* refs leak the lib requirement into the published .d.ts:\n${offenders.join('\n')}`).toEqual(
      []
    );
  });
});
