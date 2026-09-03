// The vulnerability dictionary: for every kind of data a decoder rebuilds, the
// known and possible attacks with concrete payloads.
//
// Two payload families per entry:
//   json    a value spliced into the PARSED JSON tree at a position of `kind`
//           (the secjson lane). A prototype-key payload is built with
//           `defineOwn`, so `JSON.stringify` emits it as an OWN key and the
//           re-parsed tree carries it the way an attacker's body would.
//   binary  bytes spliced at a wire-map read of `read` (the secbinary lane),
//           see wireMutations.ts for the splice mechanics.
//
// `expect: 'reject'` marks a payload the type system rules out: `parse` MUST
// throw and a decoder must throw or hand back a value `validate` refuses. A
// mis-accept there is a finding. `expect: 'any'` payloads only feed the
// resource / prototype / totality oracles (a payload the type may legitimately
// accept, or one whose outcome depends on the surrounding type).
//
// The wrong-type matrix (`wrongTypeEntries`) is generated, not listed: one
// sample of every other kind at every position, so a string in a number slot,
// `true` in a string slot, an object in an array slot and every other pairing
// are always tried. `expectWrongType` says which pairings the type system
// rules out, conservatively: when a decoder legitimately coerces (a number into
// `new Date(n)`), the pairing is 'any'.
//
// Erasable TypeScript only (no enums, no parameter properties): the worker
// thread loads this file through Node's native type stripping.

/** The decoded data kinds a position can have (the shape-model vocabulary,
 *  see core/typeGen.ts, plus the wire-level reads the binary lane sees). **/
export type AttackKind =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'literal'
  | 'enum'
  | 'union'
  | 'array'
  | 'tuple'
  | 'object'
  | 'record'
  | 'map'
  | 'set'
  | 'any'
  | 'optional'
  | 'format-string'
  | 'format-number'
  | 'temporal';

/** The vulnerability class an entry probes. Every class has at least one
 *  entry (pinned by attackDictionary.unit.test.ts). **/
export type AttackClass =
  | 'memory'
  | 'truncation'
  | 'type-confusion'
  | 'prototype'
  | 'redos'
  | 'stack'
  | 'raw-error'
  | 'transform'
  | 'unicode'
  | 'numeric'
  | 'envelope'
  | 'time';

export type Expect = 'reject' | 'any';

/** What a JSON payload builder gets to see about the position it attacks. **/
export interface JsonAttackCtx {
  rng: () => number;
  /** The current (valid) JSON node at the position. **/
  node: unknown;
  /** Union positions: member count. **/
  members?: number;
  /** Literal positions: the literal value. **/
  literal?: unknown;
  /** Enum positions: the member values. **/
  enumValues?: unknown[];
}

export interface AttackEntry {
  id: string;
  kind: AttackKind;
  class: AttackClass;
  expect: Expect;
  json?: (ctx: JsonAttackCtx) => unknown;
}

/** Deep nesting ceiling for the stack attacks. A validator depth bound is a
 *  contract decision outside these lanes, so they stop well under the engine's
 *  stack limit and only prove nothing hangs or corrupts below it. **/
export const NESTING_CEILING = 256;

// Fuzz-sized, not attacker-sized: a lane runs thousands of attacks per type
// through four decoders, so the memory class is probed with payloads big
// enough to expose super-linear work (the time oracle) without the harness
// itself exhausting the heap. The count bombs on the binary wire are the
// real allocation attacks; they cost bytes, not payload size.
const BIG_STRING = 'A'.repeat(1 << 16);
const LONG_ARRAY_LENGTH = 10_000;

/** Build an object whose `__proto__` is an OWN enumerable key (what
 *  `JSON.parse('{"__proto__":…}')` yields), so `JSON.stringify` emits it and
 *  a re-parse carries it as an own key rather than setting the prototype. **/
export function defineOwn(target: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  Object.defineProperty(target, key, {value, enumerable: true, writable: true, configurable: true});
  return target;
}

function nested(depth: number, leaf: unknown): unknown {
  let out: unknown = leaf;
  for (let i = 0; i < depth; i++) out = [out];
  return out;
}

function nestedObject(depth: number, leaf: unknown): unknown {
  let out: unknown = leaf;
  for (let i = 0; i < depth; i++) out = {a: out};
  return out;
}

function protoObject(): Record<string, unknown> {
  return defineOwn({}, '__proto__', {polluted: true});
}

function pumpString(unit: string, repeat: number, tail: string): string {
  return unit.repeat(repeat) + tail;
}

const e = (entry: AttackEntry): AttackEntry => entry;

/** The dictionary. Order is the report order. **/
export const ATTACK_DICTIONARY: readonly AttackEntry[] = [
  // ---- string --------------------------------------------------------------
  e({id: 'string.empty', kind: 'string', class: 'type-confusion', expect: 'any', json: () => ''}),
  e({id: 'string.megabyte', kind: 'string', class: 'memory', expect: 'any', json: () => BIG_STRING}),
  e({id: 'string.nul', kind: 'string', class: 'unicode', expect: 'any', json: () => 'a\u0000b\u0000'}),
  e({id: 'string.controls', kind: 'string', class: 'unicode', expect: 'any', json: () => '\u0001\u0002\u001f\u007f\r\n\t'}),
  e({id: 'string.lone-surrogate', kind: 'string', class: 'unicode', expect: 'any', json: () => 'a\ud800b\udfffc'}),
  e({id: 'string.bom', kind: 'string', class: 'unicode', expect: 'any', json: () => '\ufeffvalue'}),
  e({id: 'string.bidi', kind: 'string', class: 'unicode', expect: 'any', json: () => 'user\u202e\u200f\u2066admin\u2069'}),
  e({id: 'string.confusables', kind: 'string', class: 'unicode', expect: 'any', json: () => 'аdmin\u0430\u1d00\uff41'}),
  e({id: 'string.proto-value', kind: 'string', class: 'prototype', expect: 'any', json: () => '__proto__'}),
  e({id: 'string.constructor-value', kind: 'string', class: 'prototype', expect: 'any', json: () => 'constructor'}),
  e({id: 'string.quotes', kind: 'string', class: 'type-confusion', expect: 'any', json: () => '"\\"\'`\n\\u0000'}),
  e({id: 'string.script', kind: 'string', class: 'type-confusion', expect: 'any', json: () => '<script>alert(1)</script>'}),
  e({id: 'string.template', kind: 'string', class: 'type-confusion', expect: 'any', json: () => '${process.env}{{7*7}}'}),

  // ---- number --------------------------------------------------------------
  e({id: 'number.nan', kind: 'number', class: 'numeric', expect: 'any', json: () => NaN}),
  e({id: 'number.infinity', kind: 'number', class: 'numeric', expect: 'any', json: () => Infinity}),
  e({id: 'number.neg-infinity', kind: 'number', class: 'numeric', expect: 'any', json: () => -Infinity}),
  e({id: 'number.neg-zero', kind: 'number', class: 'numeric', expect: 'any', json: () => -0}),
  e({id: 'number.max-safe-plus', kind: 'number', class: 'numeric', expect: 'any', json: () => 2 ** 53 + 1}),
  e({id: 'number.huge', kind: 'number', class: 'numeric', expect: 'any', json: () => 1e308}),
  e({id: 'number.denormal', kind: 'number', class: 'numeric', expect: 'any', json: () => 5e-324}),
  e({id: 'number.string', kind: 'number', class: 'type-confusion', expect: 'reject', json: () => '42'}),
  e({id: 'number.hex-string', kind: 'number', class: 'type-confusion', expect: 'reject', json: () => '0x10'}),
  e({id: 'number.boolean', kind: 'number', class: 'type-confusion', expect: 'reject', json: () => true}),
  e({id: 'number.array', kind: 'number', class: 'type-confusion', expect: 'reject', json: () => [1]}),
  e({id: 'number.valueof', kind: 'number', class: 'type-confusion', expect: 'reject', json: () => ({valueOf: 1})}),

  // ---- number formats (integer / bounds) -----------------------------------
  e({id: 'format-number.fraction', kind: 'format-number', class: 'numeric', expect: 'any', json: () => 1.5}),
  e({id: 'format-number.overflow', kind: 'format-number', class: 'numeric', expect: 'any', json: () => 2 ** 40}),
  e({id: 'format-number.negative-overflow', kind: 'format-number', class: 'numeric', expect: 'any', json: () => -(2 ** 40)}),
  e({id: 'format-number.nan', kind: 'format-number', class: 'numeric', expect: 'reject', json: () => NaN}),
  e({id: 'format-number.string', kind: 'format-number', class: 'type-confusion', expect: 'reject', json: () => '7'}),

  // ---- bigint (a decimal string on the JSON wire) --------------------------
  e({id: 'bigint.junk-suffix', kind: 'bigint', class: 'raw-error', expect: 'reject', json: () => '12x'}),
  e({id: 'bigint.fraction', kind: 'bigint', class: 'transform', expect: 'reject', json: () => '1.5'}),
  e({id: 'bigint.exponent', kind: 'bigint', class: 'transform', expect: 'reject', json: () => '1e3'}),
  e({id: 'bigint.empty', kind: 'bigint', class: 'transform', expect: 'any', json: () => ''}),
  e({id: 'bigint.whitespace', kind: 'bigint', class: 'transform', expect: 'any', json: () => ' 1 '}),
  e({id: 'bigint.hex', kind: 'bigint', class: 'transform', expect: 'any', json: () => '0x1f'}),
  e({id: 'bigint.number-fraction', kind: 'bigint', class: 'transform', expect: 'reject', json: () => 1.5}),
  e({id: 'bigint.ten-thousand-digits', kind: 'bigint', class: 'memory', expect: 'any', json: () => '9'.repeat(4_000)}),
  e({id: 'bigint.negative-zero', kind: 'bigint', class: 'numeric', expect: 'any', json: () => '-0'}),
  e({id: 'bigint.object', kind: 'bigint', class: 'type-confusion', expect: 'reject', json: () => ({})}),

  // ---- boolean -------------------------------------------------------------
  e({id: 'boolean.zero', kind: 'boolean', class: 'type-confusion', expect: 'reject', json: () => 0}),
  e({id: 'boolean.one', kind: 'boolean', class: 'type-confusion', expect: 'reject', json: () => 1}),
  e({id: 'boolean.string-true', kind: 'boolean', class: 'type-confusion', expect: 'reject', json: () => 'true'}),
  e({id: 'boolean.null', kind: 'boolean', class: 'type-confusion', expect: 'reject', json: () => null}),

  // ---- Date (an ISO string on the JSON wire) --------------------------------
  e({id: 'date.garbage', kind: 'date', class: 'transform', expect: 'reject', json: () => 'garbage'}),
  e({id: 'date.empty', kind: 'date', class: 'transform', expect: 'reject', json: () => ''}),
  e({id: 'date.nan', kind: 'date', class: 'transform', expect: 'reject', json: () => NaN}),
  e({id: 'date.past-range', kind: 'date', class: 'numeric', expect: 'reject', json: () => 8.64e15 + 1}),
  e({id: 'date.huge', kind: 'date', class: 'numeric', expect: 'reject', json: () => 1e20}),
  e({id: 'date.feb-30', kind: 'date', class: 'transform', expect: 'any', json: () => '2024-02-30'}),
  e({id: 'date.object', kind: 'date', class: 'type-confusion', expect: 'reject', json: () => ({})}),
  e({id: 'date.array', kind: 'date', class: 'type-confusion', expect: 'any', json: () => []}),
  e({id: 'date.negative-year', kind: 'date', class: 'transform', expect: 'any', json: () => '-000001-01-01T00:00:00Z'}),

  // ---- Temporal (an ISO string on the JSON wire) ---------------------------
  e({id: 'temporal.garbage', kind: 'temporal', class: 'transform', expect: 'reject', json: () => 'garbage'}),
  e({id: 'temporal.month-13', kind: 'temporal', class: 'transform', expect: 'reject', json: () => '2024-13-01'}),
  e({id: 'temporal.day-32', kind: 'temporal', class: 'transform', expect: 'reject', json: () => '2024-01-32'}),
  e({id: 'temporal.year-range', kind: 'temporal', class: 'transform', expect: 'reject', json: () => '+999999-01-01'}),
  e({
    id: 'temporal.negative-nanos',
    kind: 'temporal',
    class: 'transform',
    expect: 'reject',
    json: () => '1970-01-01T00:00:00.-1Z',
  }),
  e({id: 'temporal.number', kind: 'temporal', class: 'type-confusion', expect: 'reject', json: () => 1}),

  // ---- literal / enum -------------------------------------------------------
  e({id: 'literal.case-flip', kind: 'literal', class: 'type-confusion', expect: 'reject', json: (ctx) => flipCase(ctx.literal)}),
  e({
    id: 'literal.other-kind',
    kind: 'literal',
    class: 'type-confusion',
    expect: 'reject',
    json: (ctx) => otherKind(ctx.literal),
  }),
  e({
    id: 'literal.string-of',
    kind: 'literal',
    class: 'type-confusion',
    expect: 'reject',
    json: (ctx) => String(ctx.literal) + '\u0000',
  }),
  e({id: 'enum.outside', kind: 'enum', class: 'type-confusion', expect: 'reject', json: () => '__not_a_member__'}),
  e({id: 'enum.index-like', kind: 'enum', class: 'type-confusion', expect: 'any', json: () => 0}),
  e({id: 'enum.member-name', kind: 'enum', class: 'type-confusion', expect: 'any', json: () => 'A'}),
  e({id: 'enum.object', kind: 'enum', class: 'type-confusion', expect: 'reject', json: () => ({})}),

  // ---- union (the `[index, value]` envelope and the object discriminant) ---
  e({
    id: 'union.index-outside',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => [ctx.members ?? 99, payloadOf(ctx.node)],
  }),
  e({id: 'union.index-negative', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [-1, payloadOf(ctx.node)]}),
  e({id: 'union.index-minus-two', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [-2, payloadOf(ctx.node)]}),
  e({id: 'union.index-float', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [1.5, payloadOf(ctx.node)]}),
  e({id: 'union.index-string', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => ['0', payloadOf(ctx.node)]}),
  e({
    id: 'union.index-string-true',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => ['true', payloadOf(ctx.node)],
  }),
  e({id: 'union.index-true', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [true, payloadOf(ctx.node)]}),
  e({id: 'union.index-null', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [null, payloadOf(ctx.node)]}),
  e({id: 'union.index-nan', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [NaN, payloadOf(ctx.node)]}),
  e({id: 'union.index-huge', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => [2 ** 31, payloadOf(ctx.node)]}),
  e({
    id: 'union.index-proto',
    kind: 'union',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => ['__proto__', payloadOf(ctx.node)],
  }),
  e({id: 'union.bare-value', kind: 'union', class: 'envelope', expect: 'any', json: (ctx) => payloadOf(ctx.node)}),
  e({id: 'union.envelope-short', kind: 'union', class: 'truncation', expect: 'any', json: (ctx) => [indexOf(ctx.node)]}),
  e({id: 'union.envelope-empty', kind: 'union', class: 'envelope', expect: 'any', json: () => []}),
  e({
    id: 'union.envelope-long',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => [indexOf(ctx.node), payloadOf(ctx.node), payloadOf(ctx.node)],
  }),
  e({
    id: 'union.envelope-object',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => ({0: indexOf(ctx.node), 1: payloadOf(ctx.node)}),
  }),
  e({
    id: 'union.other-arm-payload',
    kind: 'union',
    class: 'type-confusion',
    expect: 'any',
    json: (ctx) => [otherIndex(ctx), payloadOf(ctx.node)],
  }),
  e({
    id: 'union.payload-swap',
    kind: 'union',
    class: 'type-confusion',
    expect: 'any',
    json: (ctx) => [indexOf(ctx.node), otherKind(payloadOf(ctx.node))],
  }),
  e({
    id: 'union.discriminant-missing',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => dropDiscriminant(ctx.node),
  }),
  e({
    id: 'union.discriminant-array',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => wrapDiscriminant(ctx.node, (v) => [v]),
  }),
  e({
    id: 'union.discriminant-object',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => wrapDiscriminant(ctx.node, (v) => ({v})),
  }),
  e({
    id: 'union.discriminant-case',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => wrapDiscriminant(ctx.node, flipCase),
  }),
  e({
    id: 'union.nested-envelope',
    kind: 'union',
    class: 'envelope',
    expect: 'any',
    json: (ctx) => [indexOf(ctx.node), [indexOf(ctx.node), payloadOf(ctx.node)]],
  }),

  // ---- array / tuple ---------------------------------------------------------
  e({id: 'array.length-object', kind: 'array', class: 'type-confusion', expect: 'reject', json: () => ({length: 1e9})}),
  e({id: 'array.sparse', kind: 'array', class: 'type-confusion', expect: 'any', json: (ctx) => sparse(ctx.node)}),
  e({id: 'array.long', kind: 'array', class: 'memory', expect: 'any', json: (ctx) => longArray(ctx.node)}),
  e({id: 'array.deep', kind: 'array', class: 'stack', expect: 'any', json: (ctx) => nested(NESTING_CEILING, firstOf(ctx.node))}),
  e({id: 'array.string', kind: 'array', class: 'type-confusion', expect: 'reject', json: () => 'not an array'}),
  e({
    id: 'array.object-with-indexes',
    kind: 'array',
    class: 'type-confusion',
    expect: 'reject',
    json: (ctx) => Object.assign({}, arrayOf(ctx.node)),
  }),
  e({id: 'tuple.short', kind: 'tuple', class: 'truncation', expect: 'any', json: (ctx) => arrayOf(ctx.node).slice(0, -1)}),
  e({id: 'tuple.long', kind: 'tuple', class: 'envelope', expect: 'any', json: (ctx) => [...arrayOf(ctx.node), 'extra', 'extra']}),
  e({id: 'tuple.empty', kind: 'tuple', class: 'envelope', expect: 'any', json: () => []}),
  e({
    id: 'tuple.rest-overflow',
    kind: 'tuple',
    class: 'memory',
    expect: 'any',
    json: (ctx) => [...arrayOf(ctx.node), ...new Array(LONG_ARRAY_LENGTH).fill(0)],
  }),
  e({id: 'tuple.object', kind: 'tuple', class: 'type-confusion', expect: 'reject', json: () => ({0: 'a', 1: 'b'})}),

  // ---- object / record / class -------------------------------------------
  e({
    id: 'object.proto-key',
    kind: 'object',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, '__proto__', {polluted: true}),
  }),
  e({
    id: 'object.constructor-key',
    kind: 'object',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, 'constructor', {prototype: {polluted: true}}),
  }),
  e({
    id: 'object.prototype-key',
    kind: 'object',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, 'prototype', {polluted: true}),
  }),
  e({
    id: 'object.proto-nested',
    kind: 'object',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, 'constructor', {prototype: protoObject()}),
  }),
  e({id: 'object.nul-key', kind: 'object', class: 'unicode', expect: 'any', json: (ctx) => withOwnKey(ctx.node, 'a\u0000b', 1)}),
  e({id: 'object.many-keys', kind: 'object', class: 'memory', expect: 'any', json: (ctx) => manyKeys(ctx.node)}),
  e({
    id: 'object.deep',
    kind: 'object',
    class: 'stack',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, 'deep', nestedObject(NESTING_CEILING, 1)),
  }),
  // An array is the compact decoder's positional wire for an object (an empty
  // one: every prop absent), so no 'reject' claim.
  e({id: 'object.array', kind: 'object', class: 'type-confusion', expect: 'any', json: () => []}),
  e({id: 'object.string', kind: 'object', class: 'type-confusion', expect: 'reject', json: () => 'x'}),
  e({id: 'object.null', kind: 'object', class: 'type-confusion', expect: 'reject', json: () => null}),
  e({
    id: 'record.proto-key',
    kind: 'record',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, '__proto__', {polluted: true}),
  }),
  e({
    id: 'record.constructor-key',
    kind: 'record',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, 'constructor', {polluted: true}),
  }),
  e({
    id: 'record.prototype-key',
    kind: 'record',
    class: 'prototype',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, 'prototype', 1),
  }),
  e({
    id: 'record.numeric-keys',
    kind: 'record',
    class: 'type-confusion',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, '0', firstValueOf(ctx.node)),
  }),
  e({id: 'record.many-keys', kind: 'record', class: 'memory', expect: 'any', json: (ctx) => manyKeys(ctx.node)}),
  e({
    id: 'record.long-key',
    kind: 'record',
    class: 'memory',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, BIG_STRING, firstValueOf(ctx.node)),
  }),
  e({
    id: 'record.pattern-pump',
    kind: 'record',
    class: 'redos',
    expect: 'any',
    json: (ctx) => withOwnKey(ctx.node, pumpString('n_', 5000, '!'), firstValueOf(ctx.node)),
  }),
  e({id: 'record.array', kind: 'record', class: 'type-confusion', expect: 'reject', json: () => [1, 2]}),

  // ---- Map / Set (arrays on the JSON wire) --------------------------------
  e({id: 'map.not-pairs', kind: 'map', class: 'envelope', expect: 'any', json: () => [1, 2, 3]}),
  e({id: 'map.single-slot', kind: 'map', class: 'envelope', expect: 'any', json: () => [['k']]}),
  e({id: 'map.duplicate-keys', kind: 'map', class: 'envelope', expect: 'any', json: (ctx) => duplicateFirst(ctx.node)}),
  e({id: 'map.object', kind: 'map', class: 'type-confusion', expect: 'reject', json: () => ({k: 'v'})}),
  e({id: 'map.proto-key', kind: 'map', class: 'prototype', expect: 'any', json: () => [['__proto__', {polluted: true}]]}),
  e({id: 'map.long', kind: 'map', class: 'memory', expect: 'any', json: (ctx) => longArray(ctx.node)}),
  e({id: 'set.object', kind: 'set', class: 'type-confusion', expect: 'reject', json: () => ({a: 1})}),
  e({id: 'set.duplicates', kind: 'set', class: 'envelope', expect: 'any', json: (ctx) => duplicateFirst(ctx.node)}),
  e({id: 'set.long', kind: 'set', class: 'memory', expect: 'any', json: (ctx) => longArray(ctx.node)}),

  // ---- any / unknown / object -----------------------------------------
  e({id: 'any.proto', kind: 'any', class: 'prototype', expect: 'any', json: () => protoObject()}),
  e({id: 'any.megabyte', kind: 'any', class: 'memory', expect: 'any', json: () => BIG_STRING}),
  e({id: 'any.deep', kind: 'any', class: 'stack', expect: 'any', json: () => nested(NESTING_CEILING, 1)}),
  e({id: 'any.deep-objects', kind: 'any', class: 'stack', expect: 'any', json: () => nestedObject(NESTING_CEILING, 1)}),
  e({id: 'any.wide', kind: 'any', class: 'memory', expect: 'any', json: () => new Array(LONG_ARRAY_LENGTH).fill(protoObject())}),

  // ---- optional / null / undefined -----------------------------------
  e({id: 'optional.null', kind: 'optional', class: 'type-confusion', expect: 'any', json: () => null}),
  e({id: 'optional.undefined', kind: 'optional', class: 'type-confusion', expect: 'any', json: () => undefined}),
  e({id: 'optional.empty-object', kind: 'optional', class: 'type-confusion', expect: 'any', json: () => ({})}),

  // ---- string formats -------------------------------------------------
  e({
    id: 'format-string.at-flood',
    kind: 'format-string',
    class: 'redos',
    expect: 'any',
    json: () => pumpString('@', 8_000, 'x'),
  }),
  e({
    id: 'format-string.dot-flood',
    kind: 'format-string',
    class: 'redos',
    expect: 'any',
    json: () => pumpString('a.', 8_000, '!'),
  }),
  e({
    id: 'format-string.dash-flood',
    kind: 'format-string',
    class: 'redos',
    expect: 'any',
    json: () => pumpString('a-', 8_000, '!'),
  }),
  e({
    id: 'format-string.digit-run',
    kind: 'format-string',
    class: 'redos',
    expect: 'any',
    json: () => pumpString('9', 16_000, 'x'),
  }),
  e({
    id: 'format-string.brackets',
    kind: 'format-string',
    class: 'redos',
    expect: 'any',
    json: () => pumpString('[', 5_000, ']'),
  }),
  e({
    id: 'format-string.prefix-junk',
    kind: 'format-string',
    class: 'redos',
    expect: 'any',
    json: (ctx) => `${String(ctx.node)}${'\u0301'.repeat(4_000)}`,
  }),
  e({
    id: 'format-string.rtl',
    kind: 'format-string',
    class: 'unicode',
    expect: 'any',
    json: () => '\u05d0'.repeat(2000) + '@' + '\u0627'.repeat(2000),
  }),
  e({
    id: 'format-string.surrogate',
    kind: 'format-string',
    class: 'unicode',
    expect: 'any',
    json: (ctx) => `${String(ctx.node)}\ud800`,
  }),
  e({id: 'format-string.number', kind: 'format-string', class: 'type-confusion', expect: 'reject', json: () => 12345}),
  e({id: 'format-string.megabyte', kind: 'format-string', class: 'time', expect: 'any', json: () => BIG_STRING}),
];

// ---- wrong-type matrix ------------------------------------------------------

/** One sample of every kind the matrix splices at every position. Keys name
 *  the sample's own kind. **/
export const WRONG_TYPE_SAMPLES: Readonly<Record<string, () => unknown>> = {
  string: () => 'wrong',
  number: () => 12345,
  bigintString: () => '12345678901234567890',
  boolean: () => true,
  null: () => null,
  undefined: () => undefined,
  array: () => [1, 'two', null],
  object: () => ({a: 1}),
  emptyObject: () => ({}),
  dateString: () => '2024-01-01T00:00:00.000Z',
  nested: () => ({a: {b: [{c: 1}]}}),
};

/** Whether the type system rules out `sampleKind` at a position of `kind`.
 *  Conservative: 'reject' only where a decoder cannot legitimately coerce and
 *  the validator provably refuses. **/
export function expectWrongType(kind: AttackKind, sampleKind: string): Expect {
  // `undefined` has no JSON spelling: at a property it drops the key (legal
  // for an optional slot), in an array it becomes null (the null sample).
  if (sampleKind === 'undefined') return 'any';
  switch (kind) {
    case 'string':
      return sampleKind === 'string' || sampleKind === 'bigintString' || sampleKind === 'dateString' ? 'any' : 'reject';
    case 'number':
    case 'format-number':
      return sampleKind === 'number' ? 'any' : 'reject';
    case 'boolean':
      return sampleKind === 'boolean' ? 'any' : 'reject';
    case 'bigint':
      // The wire form is a decimal string; a whole number is the one lenient
      // spelling `parse` promises. Every other kind reaches validate untouched.
      return sampleKind === 'bigintString' || sampleKind === 'number' ? 'any' : 'reject';
    case 'date':
      // The wire form is an ISO string; the restore arm transforms only
      // strings, so a number, boolean or null is not coerced into a Date.
      return sampleKind === 'dateString' ? 'any' : 'reject';
    case 'array':
    case 'tuple':
    case 'map':
    case 'set':
      return sampleKind === 'array' ? 'any' : 'reject';
    case 'object':
    case 'record':
      // An array is the compact decoder's positional wire for an object.
      return sampleKind === 'object' || sampleKind === 'emptyObject' || sampleKind === 'nested' || sampleKind === 'array'
        ? 'any'
        : 'reject';
    case 'format-string':
      return sampleKind === 'string' || sampleKind === 'bigintString' || sampleKind === 'dateString' ? 'any' : 'reject';
    default:
      // union / literal / enum / temporal / any / optional: the wire
      // form or the member set decides, so no promise.
      return 'any';
  }
}

/** The generated wrong-type entries for `kind` (one per sample kind). **/
export function wrongTypeEntries(kind: AttackKind): AttackEntry[] {
  return Object.entries(WRONG_TYPE_SAMPLES).map(([sampleKind, sample]) => ({
    id: `wrong-type.${kind}.${sampleKind}`,
    kind,
    class: 'type-confusion',
    expect: expectWrongType(kind, sampleKind),
    json: sample,
  }));
}

/** Every entry that applies to a position of `kind`: the listed attacks plus
 *  the wrong-type matrix. **/
export function attacksFor(kind: AttackKind): AttackEntry[] {
  return [...ATTACK_DICTIONARY.filter((entry) => entry.kind === kind), ...wrongTypeEntries(kind)];
}

/** Every vulnerability class the dictionary must cover. **/
export const ATTACK_CLASSES: readonly AttackClass[] = [
  'memory',
  'truncation',
  'type-confusion',
  'prototype',
  'redos',
  'stack',
  'raw-error',
  'transform',
  'unicode',
  'numeric',
  'envelope',
  'time',
];

// ---- payload helpers ----------------------------------------------------------

function flipCase(value: unknown): unknown {
  if (typeof value !== 'string') return typeof value === 'number' ? -value - 1 : !value;
  const flipped = value === value.toUpperCase() ? value.toLowerCase() : value.toUpperCase();
  return flipped === value ? value + 'X' : flipped;
}

function otherKind(value: unknown): unknown {
  if (typeof value === 'string') return 1234567;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return '__other__';
}

function payloadOf(node: unknown): unknown {
  return isEnvelope(node) ? (node as unknown[])[1] : node;
}

function indexOf(node: unknown): unknown {
  return isEnvelope(node) ? (node as unknown[])[0] : 0;
}

function otherIndex(ctx: JsonAttackCtx): number {
  const current = indexOf(ctx.node);
  const members = ctx.members ?? 2;
  const candidate = typeof current === 'number' ? (current + 1) % members : 0;
  return candidate;
}

/** A JSON union node is an envelope when it is a 2-slot array whose first slot
 *  is a member index (or the -1 merged-object sentinel). **/
export function isEnvelope(node: unknown): boolean {
  return Array.isArray(node) && node.length === 2 && typeof node[0] === 'number' && Number.isInteger(node[0]) && node[0] >= -1;
}

function dropDiscriminant(node: unknown): unknown {
  const payload = payloadOf(node);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const copy = {...(payload as Record<string, unknown>)};
  // Drop the conventional discriminant key; when there is none, the first key.
  const known = ['kind', 'type', 'tag', 'k'].filter((key) => key in copy);
  const target = known[0] ?? Object.keys(copy)[0];
  if (target !== undefined) delete copy[target];
  return isEnvelope(node) ? [indexOf(node), copy] : copy;
}

function wrapDiscriminant(node: unknown, wrap: (v: unknown) => unknown): unknown {
  const payload = payloadOf(node);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return wrap(payload);
  const copy = {...(payload as Record<string, unknown>)};
  const keys = Object.keys(copy);
  const target = keys.find((key) => ['kind', 'type', 'tag', 'k'].includes(key)) ?? keys[0];
  if (target !== undefined) copy[target] = wrap(copy[target]);
  return isEnvelope(node) ? [indexOf(node), copy] : copy;
}

function arrayOf(node: unknown): unknown[] {
  return Array.isArray(node) ? node : [];
}

function firstOf(node: unknown): unknown {
  return Array.isArray(node) && node.length > 0 ? node[0] : 1;
}

function sparse(node: unknown): unknown[] {
  const out = [...arrayOf(node)];
  out.length = out.length + 3;
  return out;
}

function longArray(node: unknown): unknown[] {
  const unit = firstOf(node);
  return new Array(LONG_ARRAY_LENGTH).fill(unit);
}

function withOwnKey(node: unknown, key: string, value: unknown): unknown {
  const base = node && typeof node === 'object' && !Array.isArray(node) ? {...(node as Record<string, unknown>)} : {};
  return defineOwn(base, key, value);
}

function firstValueOf(node: unknown): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return 1;
  const values = Object.values(node as Record<string, unknown>);
  return values.length > 0 ? values[0] : 1;
}

function manyKeys(node: unknown): unknown {
  const out = withOwnKey(node, 'k', 1) as Record<string, unknown>;
  const value = firstValueOf(node);
  for (let i = 0; i < LONG_ARRAY_LENGTH; i++) out[`key${i}`] = value;
  return out;
}

function duplicateFirst(node: unknown): unknown {
  const items = arrayOf(node);
  return items.length > 0
    ? [items[0], items[0], ...items]
    : [
        ['k', 1],
        ['k', 2],
      ];
}
