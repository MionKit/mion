// Right-to-left edit application.
//
// The whole reason this is not a `String.replace` loop: replacements change length, so
// every edit applied left-to-right invalidates the offsets of the ones after it. Sorting
// descending by start and splicing from the end means each edit lands on offsets that are
// still valid, and one pass is enough.
//
// This mirrors the approach in packages/ts-runtypes-devtools/src/edit-buffer.ts but is a
// local copy on purpose: this directory is deleted when the migration lands, and it must
// not leave an import dangling in the workspace behind it.

export function applyEdits(text, edits) {
  if (edits.length === 0) return text;

  const ordered = [...edits].sort((a, b) => b.start - a.start);

  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].end > ordered[i - 1].start) {
      throw new Error(
        `overlapping edits at ${ordered[i].start}..${ordered[i].end} and ` +
          `${ordered[i - 1].start}..${ordered[i - 1].end}`
      );
    }
  }

  let out = text;
  for (const edit of ordered) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}
