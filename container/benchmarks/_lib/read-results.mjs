// The ONE reader of a benchmark results directory, shared by the two consumers that
// join per-competitor timings: container/benchmarks/aggregate.mjs (the terminal table,
// run inside the image) and scripts/website/bench-data/gen-docs.mjs (the website data,
// run on the host). Both used to carry their own copy, and the same bug landed in both.
//
// results/ holds far more than the per-competitor timing files: env.json, the audit
// lane's <competitor>.alignment.json plus alignment-misalignments.json, the
// <form>.typecost.json / <lib>.compiletime.json / transform-wire.json artifacts, and
// stale <competitor>.spec.json from the removed spec-conformance lane.
//
// Filtering those out on SHAPE alone is what shipped a broken published table: the
// typecost lane writes `{competitor, cases, total}`, which is indistinguishable from a
// timing result by any shape test built on those two fields. Every duplicated name then
// became a duplicate COLUMN, and because the joined lookup is keyed by competitor name
// the later file won, so zod / typebox / typia rendered n-a with their real numbers gone.
//
// So the primary rule is the FILENAME, which the layout already guarantees: a competitor
// result is always `<name>.json` (result.ts writes exactly that, per-runtime lanes going
// to a SUBDIR rather than a suffixed sibling), and every other artifact carries a kind
// segment, `<name>.<kind>.json`. Requiring a single extension rules out every artifact
// above at once, including the `.spec.json` case that used to need its own exception, and
// it stays correct the moment a new artifact kind is added.
//
// The shape test stays as a second gate, now asking for `summary` as well: it is what
// tells a real timing result from anything else that might one day be named `<name>.json`.

import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

// `<name>.json` with no kind segment. Competitor names are plain (letters, digits,
// hyphens), so a dot anywhere before `.json` means an artifact, not a result.
const RESULT_FILE = /^[^.]+\.json$/;

/** Every competitor timing result in `dir`, in readdir order. Missing dir -> []. The
 *  `note` callback receives one line naming what was skipped, so a genuinely malformed
 *  competitor file surfaces instead of disappearing. Throws when two accepted files
 *  claim the same competitor: that is the duplicate-column bug, and it must be loud. */
export function readCompetitorResults(dir, note = () => {}) {
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  const skipped = [];
  const seen = new Map(); // competitor -> the file that claimed it
  for (const file of files.filter((f) => RESULT_FILE.test(f))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    } catch (err) {
      skipped.push(`${file} (unreadable JSON: ${err.message})`);
      continue;
    }
    if (typeof parsed?.competitor !== 'string' || !Array.isArray(parsed.cases) || typeof parsed.summary !== 'object' || parsed.summary === null) {
      skipped.push(`${file} (not a competitor result: no competitor/cases/summary)`);
      continue;
    }
    const previous = seen.get(parsed.competitor);
    if (previous) {
      throw new Error(
        `read-results: ${dir} has two results for competitor '${parsed.competitor}' (${previous} and ${file}). ` +
          `One of them is not a timing result — publishing both would duplicate that column and blank its numbers.`
      );
    }
    seen.set(parsed.competitor, file);
    results.push(parsed);
  }
  if (skipped.length > 0) note(`skipped ${skipped.length} non-competitor file(s) in ${dir}: ${skipped.join(', ')}`);
  return results;
}
