// The columns every generated benchmark dataset may carry, by dataset slug: ONE list
// the benchmark driver runs (bench.mjs competitorList), the generators refuse to
// emit anything outside of (gen-docs.mjs), and the post-build gate demands in full
// (check-static.mjs). It exists because the generator used to take every
// results/*.json it found: a result file left behind by an older run (a renamed
// competitor, a typecost form) became an extra, empty column on the validation
// pages, twice for a library measured in two files.

/** The runtime validators, in column order: the validation, formats and correctness pages. */
export const COMPETITORS = ['mion', 'zod', 'typebox', 'ajv', 'typia'];

/** The columns of each dataset (index.json `competitors`), in order. */
export const BENCH_COLUMNS = {
  validation: COMPETITORS,
  'validation-formats': COMPETITORS,
  alignment: COMPETITORS,
  // authoring forms, not libraries (gen-docs TYPECOST_FORMS labels)
  typecost: ['mion (type)', 'mion (builder)', 'typia', 'typebox', 'zod'],
  // build stages, not libraries (gen-docs compiletime TIERS labels)
  compiletime: ['tsgo compile', 'full runtypes', 'typecheck+full runtypes', 'transform cost'],
  // round-trips, not libraries (gen-serialization ROUNDTRIPS keys)
  serialization: ['clone', 'mutate', 'direct', 'compact', 'binary', 'native JSON'],
  'serialization-formats': ['clone', 'mutate', 'direct', 'compact', 'binary', 'native JSON'],
};

/** What is wrong with `columns` for `bench`: names outside the list, a name listed
 *  twice, and (when `requireAll`) names from the list that are absent. Empty when
 *  the columns are exactly a subset (or, with requireAll, exactly the list). */
export function columnProblems(bench, columns, {requireAll = false} = {}) {
  const expected = BENCH_COLUMNS[bench];
  if (!expected) return [`no column list for dataset '${bench}' (add it to scripts/website/bench-data/columns.mjs)`];
  const problems = [];
  const seen = new Set();
  for (const column of columns) {
    if (!expected.includes(column)) problems.push(`unknown column '${column}' (allowed: ${expected.join(', ')})`);
    if (seen.has(column)) problems.push(`column '${column}' listed twice`);
    seen.add(column);
  }
  if (requireAll) for (const column of expected) if (!seen.has(column)) problems.push(`missing column '${column}'`);
  return problems;
}
