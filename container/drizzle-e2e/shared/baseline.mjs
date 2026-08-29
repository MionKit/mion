// Compare a tsc run over the TRANSLATED tree against the same run over the
// untranslated CONTROL. Same rule as the suite comparison next door: the lane
// does not claim the tree typechecks clean, it claims the translation changed
// nothing. drizzle's own suites do not typecheck clean against every vitest and
// driver version, and a list of excuses is a thing someone has to keep honest.
//
// Line and column move (the translation inserts a `const x = toDrizzle(x$table)`
// line per split declaration) and the two trees live at different paths, so the
// comparison is on file + code + message, with the position dropped.

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

/** What the translation ADDED and what it REMOVED. Both empty means the
 *  translated tree typechecks exactly as the untranslated one does. */
export function diffTypeErrors({translated, control, roots}) {
  const after = tally(translated, roots);
  const before = tally(control, roots);
  const added = [];
  const removed = [];
  for (const [line, count] of after) {
    const extra = count - (before.get(line) ?? 0);
    for (let i = 0; i < extra; i++) added.push(line);
  }
  for (const [line, count] of before) {
    const missing = count - (after.get(line) ?? 0);
    for (let i = 0; i < missing; i++) removed.push(line);
  }
  return {added, removed, translatedCount: translated.length, controlCount: control.length};
}

/** Only the `error TSxxxx:` lines of a tsc run. */
export function errorLines(output) {
  return output.split('\n').filter((line) => /error TS\d+:/.test(line));
}
