// The runtime half of the `jsonSchema` (jsc) cache family: the compiled entry
// returns the per-type JSON Schema DOCUMENT (rendered at build time by the Go
// schemadoc renderer — wire-first standard keywords + the RunTypes JS dialect
// rows beside them). This module owns everything the converters do to that
// document at runtime: the target check, the portable strip, and the
// encoder-strategy closedness stamp.
//
// ONE document serves both converter sides: the standard keywords describe the
// JSON wire, the dialect keywords annotate what the JSON becomes in JS
// (documented in the website's JSON Schema JS guide). `input()` and `output()`
// therefore return the SAME document — RunTypes validates without
// transforming, which is exactly the non-transforming shape the Standard
// Schema spec permits. The `encoderStrategy` option follows the same rule: it
// is an explicit caller declaration of the wire the paired JSON encoder
// produces, and the one shared document reflects it on whichever side reads
// it.

import type {StandardJSONSchemaConverter, StandardJSONSchemaOptions} from './spec.ts';
import type {JsonEncoderStrategy} from '../createRTFunctions.ts';

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
    throw new RangeError(`mion emits '${JSON_SCHEMA_TARGET}' JSON Schema documents; target '${target}' is not supported`);
  }
}

function isPortable(options?: StandardJSONSchemaOptions): boolean {
  return options?.libraryOptions?.portable === true;
}

// The encoder strategies whose keyed wire NEVER carries undeclared keys:
// `clone` builds the value from the declared shape, `direct` walks it.
// `mutate` is the one that preserves extras on the wire (`compact` also
// strips, but its wire is positional — encoderStrategyOf refuses it).
// Closedness is DERIVED from this — there is deliberately no independent
// additionalProperties param that could contradict the strategy.
const STRIPPING_ENCODER_STRATEGIES = new Set<JsonEncoderStrategy>(['clone', 'direct']);
const ENCODER_STRATEGIES = new Set<JsonEncoderStrategy>(['clone', 'mutate', 'direct', 'compact']);

/** Reads and validates `libraryOptions.encoderStrategy`. `'compact'` throws:
 *  its wire is positional arrays, which this keyed document does not
 *  describe (the compact wire is shape-coupled, like the binary codec). **/
function encoderStrategyOf(options?: StandardJSONSchemaOptions): JsonEncoderStrategy | undefined {
  const raw = options?.libraryOptions?.encoderStrategy;
  if (raw === undefined) return undefined;
  if (!ENCODER_STRATEGIES.has(raw as JsonEncoderStrategy)) {
    const shown = typeof raw === 'string' ? `'${raw}'` : `a ${typeof raw}`;
    throw new RangeError(`unknown encoderStrategy ${shown} (expected 'clone' | 'mutate' | 'direct')`);
  }
  if (raw === 'compact') {
    throw new RangeError(
      "the 'compact' wire is positional arrays, which this keyed document does not describe; no JSON Schema is emitted for it"
    );
  }
  return raw as JsonEncoderStrategy;
}

// Keys whose values are JSON DATA, not subschemas — the closedness walk must
// not descend into them (a literal value could coincidentally look like an
// object schema). `tsMeta` is NOT here: its `base` / `meta` halves are real
// schemas.
const VALUE_POSITION_KEYS = new Set(['const', 'enum', 'default', 'examples', 'rtFormatParams']);

/** Deep-stamps `additionalProperties: false` onto every KEYED object node —
 *  `type: 'object'` with declared `properties` and no `additionalProperties`
 *  of its own. Records (whose `additionalProperties` carries the index
 *  schema) and the bare `object` keyword (no `properties` — closing it would
 *  read as "no keys at all") are left alone. **/
export function closeDeclaredObjects(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(closeDeclaredObjects);
  if (value === null || typeof value !== 'object') return value;
  const node = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    out[key] = VALUE_POSITION_KEYS.has(key) ? child : closeDeclaredObjects(child);
  }
  const declaredProperties = out.properties;
  if (
    out.type === 'object' &&
    declaredProperties !== null &&
    typeof declaredProperties === 'object' &&
    !('additionalProperties' in out)
  ) {
    out.additionalProperties = false;
  }
  return out;
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
    let doc: unknown = docFn();
    // The stamp runs BEFORE the portable strip: additionalProperties is
    // standard vocabulary, so a portable closed document keeps it.
    const strategy = encoderStrategyOf(options);
    if (strategy !== undefined && STRIPPING_ENCODER_STRATEGIES.has(strategy)) {
      doc = closeDeclaredObjects(doc);
    }
    if (isPortable(options)) doc = stripDialect(doc);
    return doc as Record<string, unknown>;
  };
  return {input: read, output: read};
}
