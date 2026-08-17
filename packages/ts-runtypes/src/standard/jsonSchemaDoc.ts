// The runtime half of the `jsonSchema` (jsc) cache family: the compiled entry
// returns the per-type JSON Schema DOCUMENT (rendered at build time by the Go
// schemadoc renderer — wire-first standard keywords + the RunTypes JS dialect
// rows beside them). This module owns everything the converters do to that
// document at runtime: the target check and the portable strip.
//
// ONE document serves both converter sides: the standard keywords describe the
// JSON wire, the dialect keywords annotate what the JSON becomes in JS
// (documented in the website's JSON Schema JS guide). `input()` and `output()`
// therefore return the SAME document — RunTypes validates without
// transforming, which is exactly the non-transforming shape the Standard
// Schema spec permits.

import type {StandardJSONSchemaConverter, StandardJSONSchemaOptions} from './spec.ts';

/** The compiled jsc entry's shape: returns the document object. **/
export type JsonSchemaDocFn = () => Record<string, unknown>;

/** The one target this library emits. Other dialects throw (out of scope). **/
export const JSON_SCHEMA_TARGET = 'draft-2020-12';

/** The RunTypes dialect keywords — the JS-extension rows the Go renderer can
 *  emit beside the standard vocabulary. `{portable: true}` strips exactly
 *  these. The list is pinned against the Go renderer by the doc-suite tests:
 *  a keyword added on the Go side without a row here survives the strip and
 *  fails the portable assertions. **/
export const JSON_SCHEMA_DIALECT_KEYWORDS = [
  'jsType',
  'jsResolved',
  'rtFormat',
  'rtFormatParams',
  'tsIndexes',
  'tsFunction',
  'tsTemplate',
  'tsLabels',
  'tsReadonly',
  'tsMeta',
] as const;

const DIALECT_KEY_SET = new Set<string>(JSON_SCHEMA_DIALECT_KEYWORDS);

function assertTarget(options?: StandardJSONSchemaOptions): void {
  const target = options?.target;
  if (target !== undefined && target !== JSON_SCHEMA_TARGET) {
    throw new RangeError(`ts-runtypes emits '${JSON_SCHEMA_TARGET}' JSON Schema documents; target '${target}' is not supported`);
  }
}

function isPortable(options?: StandardJSONSchemaOptions): boolean {
  return options?.libraryOptions?.portable === true;
}

/** Deep-strips the dialect keywords from a document, returning plain 2020-12.
 *  A `tsMeta` node collapses to its (stripped) base — the metadata halves are
 *  annotation-only; a node left empty by the strip reads as `{}` (any value),
 *  which is the honest under-constraint. **/
export function stripDialect(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDialect);
  if (value === null || typeof value !== 'object') return value;
  const node = value as Record<string, unknown>;
  const meta = node.tsMeta;
  if (meta !== null && typeof meta === 'object' && 'base' in (meta as object)) {
    return stripDialect((meta as {base: unknown}).base);
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    if (DIALECT_KEY_SET.has(key)) continue;
    out[key] = stripDialect(child);
  }
  return out;
}

/** Builds the `~standard.jsonSchema` converter over a compiled document fn.
 *  Both sides return the same document (see the module doc). **/
export function buildJsonSchemaConverter(docFn: JsonSchemaDocFn): StandardJSONSchemaConverter {
  const read = (options?: StandardJSONSchemaOptions): Record<string, unknown> => {
    assertTarget(options);
    const doc = docFn();
    if (isPortable(options)) return stripDialect(doc) as Record<string, unknown>;
    return doc;
  };
  return {input: read, output: read};
}
