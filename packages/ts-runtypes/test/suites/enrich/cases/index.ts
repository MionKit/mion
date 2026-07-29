// Drift guard for the AI-enrichment generation suite (mirrors
// validation/index.ts): every category const, gathered under one `as const
// satisfies Record<string, Record<string, EnrichCase>>`. A mis-shaped case
// fails the compile here; the gen adapter also asserts every case produced CLI
// output, so a typo'd key surfaces as a red test.
//
// No jsonSchema-authored case here, BY DECISION (json-schema M3): the
// span-extraction convention lifts each case's `// ##### src #####` span into
// a standalone program via the Go extract-fn-bodies tool, and a schema const
// referenced from `type Target = FromJsonSchema<typeof S>` would live outside
// the lifted span — supporting it would be a disproportionate tooling change
// for zero added coverage. Enrichment keys off the RESOLVED type graph, and a
// jsonSchema-authored root resolves to the same structural id (same registered
// graph) as its type-first twin, so enrich behavior is covered by convergence
// transitivity (pinned by suites/id-integrity/jsonSchema.test.ts).
import type {EnrichCase} from './types.ts';
import {ATOMIC} from './Atomic.ts';
import {OBJECT} from './Object.ts';
import {ARRAY} from './Array.ts';
import {TUPLE} from './Tuple.ts';
import {UNION} from './Union.ts';
import {TEMPLATE_LITERAL} from './TemplateLiteral.ts';
import {FORMAT} from './Format.ts';
import {NATIVE} from './Native.ts';
import {UTILITY} from './Utility.ts';
import {CIRCULAR} from './Circular.ts';
import {REALWORLD} from './Realworld.ts';

export const ENRICH_CASES = {
  ATOMIC,
  OBJECT,
  ARRAY,
  TUPLE,
  UNION,
  TEMPLATE_LITERAL,
  FORMAT,
  NATIVE,
  UTILITY,
  CIRCULAR,
  REALWORLD,
} as const satisfies Record<string, Record<string, EnrichCase>>;

// Maps each category's exported const name to the cases file basename — the
// adapter feeds both to the gen pipeline (extract-fn-bodies needs the file +
// const; the const drives the temp-file program).
export const ENRICH_CATEGORIES = [
  {constName: 'ATOMIC', fileBase: 'Atomic'},
  {constName: 'OBJECT', fileBase: 'Object'},
  {constName: 'ARRAY', fileBase: 'Array'},
  {constName: 'TUPLE', fileBase: 'Tuple'},
  {constName: 'UNION', fileBase: 'Union'},
  {constName: 'TEMPLATE_LITERAL', fileBase: 'TemplateLiteral'},
  {constName: 'FORMAT', fileBase: 'Format'},
  {constName: 'NATIVE', fileBase: 'Native'},
  {constName: 'UTILITY', fileBase: 'Utility'},
  {constName: 'CIRCULAR', fileBase: 'Circular'},
  {constName: 'REALWORLD', fileBase: 'Realworld'},
] as const;
