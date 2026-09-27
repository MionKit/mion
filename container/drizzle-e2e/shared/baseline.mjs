// Compare a tsc run over the TRANSLATED tree against the same run over the
// untranslated CONTROL. Same rule as the suite comparison next door: the lane
// does not claim the tree typechecks clean, it claims the translation changed
// nothing. drizzle's own suites do not typecheck clean against every vitest and
// driver version, and a list of excuses is a thing someone has to keep honest.
//
// Line and column move (the translation inserts a `const x = toDrizzle(x$table)`
// line per split declaration) and the two trees live at different paths, so the
// comparison is on file + code + message, with the position dropped.
//
// ONE kind of added error is expected: an exact-type assertion (`expectTypeOf(x).toEqualTypeOf<T>()`,
// `Expect<Equal<T, U>>`) over a row type. toDrizzle rows keep their column formats (`PositiveInt`,
// `StringTime`), so drizzle's own `{id: number}` no longer equals them. Those come back as `assertions`.

import {readFileSync} from 'node:fs';
import path from 'node:path';

/** One tsc error line, reduced to what survives the translation. */
export function normalizeError(line, roots) {
  let normalized = line;
  for (const root of roots) normalized = normalized.split(root).join('');
  return normalized.replace(/\((\d+),(\d+)\):/, ':');
}

/** Group normalized lines by their text, so N copies of one error compare as N. */
function tally(lines, roots) {
  const counts = new Map();
  for (const line of lines) {
    const key = normalizeError(line, roots);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** True when source line `lineNo` (1-based) is the type argument of an exact-type assertion. */
export function isExactTypeAssertion(sourceLines, lineNo) {
  const line = sourceLines[lineNo - 1] ?? '';
  if (/\.toEqualTypeOf\s*</.test(line) || /\bExpect<\s*Equal</.test(line)) return true;
  if (!/^\s*Equal</.test(line)) return false;
  for (let index = lineNo - 2; index >= 0; index--) {
    if (sourceLines[index].trim() === '') continue;
    return /\bExpect<\s*$/.test(sourceLines[index]);
  }
  return false;
}

/** Whether a raw tsc error line points at an exact-type assertion; `cwd` is where tsc ran. */
function onAssertion(rawLine, cwd, sources) {
  const match = /^(.+?)\((\d+),\d+\): error TS/.exec(rawLine);
  if (!match) return false;
  const file = path.resolve(cwd, match[1]);
  if (!sources.has(file)) {
    let lines = [];
    try {
      lines = readFileSync(file, 'utf8').split('\n');
    } catch {}
    sources.set(file, lines);
  }
  return isExactTypeAssertion(sources.get(file), Number(match[2]));
}

/** What the translation ADDED and what it REMOVED. Both empty means the
 *  translated tree typechecks exactly as the untranslated one does. With `cwd`,
 *  an added error on an exact-type assertion goes to `assertions` instead of `added`. */
export function diffTypeErrors({translated, control, roots, cwd}) {
  const after = tally(translated, roots);
  const before = tally(control, roots);
  const added = [];
  const assertions = [];
  const removed = [];
  const sources = new Map();
  for (const [line, count] of after) {
    const extra = count - (before.get(line) ?? 0);
    if (extra <= 0) continue;
    const onAssertions = cwd === undefined ? 0 : translated.filter((raw) => normalizeError(raw, roots) === line && onAssertion(raw, cwd, sources)).length;
    const expected = Math.min(extra, onAssertions);
    for (let i = 0; i < expected; i++) assertions.push(line);
    for (let i = expected; i < extra; i++) added.push(line);
  }
  for (const [line, count] of before) {
    const missing = count - (after.get(line) ?? 0);
    for (let i = 0; i < missing; i++) removed.push(line);
  }
  return {added, assertions, removed, translatedCount: translated.length, controlCount: control.length};
}

/** Only the `error TSxxxx:` lines of a tsc run. */
export function errorLines(output) {
  return output.split('\n').filter((line) => /error TS\d+:/.test(line));
}
