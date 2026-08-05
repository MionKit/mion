// Phase 2 — the THIRD giant switch: a seeded, recursive generator of random
// TypeScript types, deliberately spanning the WIDEST shape space we can throw at
// the pipeline. Where Phase 1 fuzzes VALUES against fixed types, this fuzzes the
// TYPES themselves: each generated type becomes a real declaration with one
// createX<T>() / getRunTypeId<T>() call site per family, and the whole Go
// resolver → plugin → runtime pipeline must handle it without crashing.
//
// The space is intentionally adversarial — not just clean DTOs:
//   - scalars + literals + `Date` / `RegExp` / `bigint`,
//   - arrays, tuples, objects (optional / readonly / method / non-ident keys),
//   - index signatures + `Record<…>`, unions, intersections,
//   - native builtins `Map` / `Set` / `Promise`,
//   - non-serialisable kinds: `function`, `symbol`, `any` / `unknown` /
//     `never` / `void` / `undefined`,
//   - named declarations: `interface` (incl. RECURSIVE / circular), `declare
//     class` (with methods), `enum`.
//
// Whether a generated type is fully serialisable is NOT a generation-time
// concern — the resolver's own diagnostics classify it at run time
// (typeFuzzRunner.ts), and the oracle tier is chosen from that. So the generator
// is free to emit anything that type-checks; robustness (no crash, valid emit)
// is policed on everything, the strong value oracles only on the serialisable
// subset.
//
// Everything draws from the global `Math.random`, so wrapping a generation in
// `withSeededRandom(seed, …)` (seededRng.ts) replays the whole type — decls and
// all — byte-for-byte from one seed.

// --- abstract shape model ---

export type TypeShape =
  | {kind: 'number'}
  | {kind: 'string'}
  | {kind: 'boolean'}
  | {kind: 'bigint'}
  | {kind: 'null'}
  | {kind: 'undefined'}
  | {kind: 'date'}
  | {kind: 'regexp'}
  | {kind: 'literal'; value: string | number | boolean}
  | {kind: 'any'}
  | {kind: 'unknown'}
  | {kind: 'never'}
  | {kind: 'void'}
  | {kind: 'symbol'}
  | {kind: 'array'; elem: TypeShape; structural?: ArrayStructural}
  | {kind: 'tuple'; elems: TypeShape[]}
  | {kind: 'object'; props: PropShape[]; index?: TypeShape; indexKey?: IndexKeyKind[]}
  | {kind: 'record'; value: TypeShape; structural?: ObjectStructural}
  | {kind: 'union'; members: TypeShape[]; exclusive?: true}
  | {kind: 'intersection'; members: TypeShape[]}
  | {kind: 'map'; key: TypeShape; value: TypeShape}
  | {kind: 'set'; elem: TypeShape}
  | {kind: 'promise'; value: TypeShape}
  | {kind: 'function'; params: TypeShape[]; ret: TypeShape}
  // Non-serialisable native binary kinds (DataOnly strips them to `never`).
  | {kind: 'arraybuffer'}
  | {kind: 'sharedarraybuffer'}
  | {kind: 'dataview'}
  | {kind: 'typedarray'; name: TypedArrayName}
  // Type-format leaves (branded string/number constraints) + their negation.
  // `not` only ever wraps a format leaf — the exact constraint the public
  // `Not<F>` surface enforces at the write site.
  | {kind: 'format'; name: FormatLeafName}
  | {kind: 'not'; child: TypeShape}
  | {kind: 'ref'; name: string};

/** The format-leaf vocabulary the generator draws from. Each entry pins BOTH
 *  spellings of the same brand — the type-first TS text (via the fixture
 *  preamble aliases below) and the sibling-typed JSON Schema document — so
 *  the jsonschema lane's id-convergence oracle covers formats and negation.
 *  `valid` values satisfy the format; `counter` values satisfy the BASE kind
 *  but fail the format (the valid values of `Not<F>`). **/
export type FormatLeafName =
  | 'email'
  | 'uuid'
  | 'minLen50'
  | 'maxLen8'
  | 'patternA'
  | 'integer'
  | 'min0max100'
  | 'base64'
  | 'jsonContent';

/** Structural constraint params the jsonschema lane can attach to an array /
 *  record shape (the formattedArray / formattedObject brands). Rendered as RAW
 *  sentinel spellings on the TS side and the matching keywords on the schema
 *  side; generated ONLY under `GenOptions.structuralFormats` so the value /
 *  binary / roundtrip lanes never see them (their value generators don't
 *  enforce the constraints — id convergence is the only oracle here). **/
export interface ArrayStructural {
  uniqueItems?: true;
  maxItems?: number;
  /** `contains` with the PINNED plain-number child (`{type: 'number'}` ↔
   *  `rt$child: number`); min 1 spells NO minContains on the schema side
   *  (the Contains default). Rendered as the raw __rtContains sentinel. **/
  contains?: {min: number; max?: number};
}
export interface ObjectStructural {
  minProperties?: number;
  maxProperties?: number;
  /** Fixed vocabulary (the pinned door leg): '^n_' keys map to numbers. **/
  patternProps?: true;
  /** Fixed typed child (the pinned ShortKeys twin): string & maxLength 3. **/
  propNames?: true;
}

/** The email pattern the fuzz brand carries (fixture alias + oracle predicate
 *  share it). Deliberately backslash-free — see FUZZ_FORMAT_PREAMBLE. **/
export const FUZZ_EMAIL_PATTERN = '^[a-z0-9.]+@[a-z0-9-]+[.][a-z]{2,}$';
export interface FormatLeafSpec {
  family: 'string' | 'number';
  tsText: string;
  schema: Record<string, unknown>;
  valid: readonly (string | number)[];
  counter: readonly (string | number)[];
  /** Reference predicate (base-kind check INCLUDED) for the offline oracle in
   *  shapeValue.unit — the integration lanes still defer to the real engine. **/
  test: (value: unknown) => boolean;
}
export const FORMAT_LEAVES: Record<FormatLeafName, FormatLeafSpec> = {
  email: {
    family: 'string',
    tsText: 'FzEmail',
    schema: {type: 'string', format: 'email'},
    valid: ['ada@example.com', 'bob.builder@test.org'],
    counter: ['plain words', 'missing-at.example.com'],
    test: (value) => typeof value === 'string' && new RegExp(FUZZ_EMAIL_PATTERN).test(value),
  },
  uuid: {
    family: 'string',
    tsText: 'FzUUID',
    schema: {type: 'string', format: 'uuid'},
    valid: ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'f47ac10b-58cc-4372-a567-0e02b2c3d479'],
    counter: ['not-a-uuid', '12345'],
    test: (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  },
  // minLength 50, NOT a small bound: the negation mock rejection-samples
  // plain random strings (length uniform over [1, 100]), so the complement
  // must stay dense under that distribution — len < 50 is a coin flip per
  // draw; a small bound like 3 would exhaust the 32-attempt budget once per
  // ~30 sites and flake the soak.
  minLen50: {
    family: 'string',
    tsText: 'FzString<{minLength: 50}>',
    schema: {type: 'string', minLength: 50},
    valid: ['this-string-is-definitely-at-least-fifty-characters-long', 'x'.repeat(60)],
    counter: ['short', ''],
    test: (value) => typeof value === 'string' && value.length >= 50,
  },
  maxLen8: {
    family: 'string',
    tsText: 'FzString<{maxLength: 8}>',
    schema: {type: 'string', maxLength: 8},
    valid: ['short', ''],
    counter: ['definitely longer than eight'],
    test: (value) => typeof value === 'string' && value.length <= 8,
  },
  patternA: {
    family: 'string',
    tsText: "FzString<{pattern: {source: '^a'; flags: ''}}>",
    schema: {type: 'string', pattern: '^a'},
    valid: ['abc', 'a'],
    counter: ['b-side', 'zzz'],
    test: (value) => typeof value === 'string' && /^a/.test(value),
  },
  integer: {
    family: 'number',
    tsText: 'FzInteger',
    schema: {type: 'integer'},
    valid: [0, 42, -3],
    counter: [1.5, -0.25],
    test: (value) => typeof value === 'number' && Number.isInteger(value),
  },
  min0max100: {
    family: 'number',
    tsText: 'FzNumber<{min: 0; max: 100}>',
    schema: {type: 'number', minimum: 0, maximum: 100},
    valid: [0, 50, 100],
    counter: [-1, 101.5],
    test: (value) => typeof value === 'number' && value >= 0 && value <= 100,
  },
  // Content keywords (M6): contentEncoding lowers to the anchored RFC 4648
  // pattern with the door's baked mock pool; contentMediaType is the
  // jsonContent parse-check family. Both complements stay dense under the
  // random-string draw (most strings are neither padded base64 nor JSON),
  // so the negation lanes' rejection sampling never starves.
  base64: {
    family: 'string',
    tsText: 'FzBase64',
    schema: {type: 'string', contentEncoding: 'base64'},
    valid: ['', 'QQ==', 'SGVsbG8='],
    counter: ['QQ=', 'not base64!'],
    test: (value) => typeof value === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),
  },
  jsonContent: {
    family: 'string',
    tsText: 'FzJson',
    schema: {type: 'string', contentMediaType: 'application/json'},
    valid: ['{}', '7', 'true'],
    counter: ['not json', '{'],
    test: (value) => {
      if (typeof value !== 'string') return false;
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
  },
};
export const FORMAT_LEAF_NAMES = Object.keys(FORMAT_LEAVES) as readonly FormatLeafName[];

/** Fixture preamble every renderer prepends when a generated type carries
 *  format/not shapes. Structural twins of the public brand ENCODINGS
 *  (typeFormat.ts / not.ts), spelled locally instead of importing
 *  '@ts-runtypes/core/formats': the fixtures must compile under tsValidate's
 *  bare host and the harnesses' virtual filesystems (runtypes.d.ts declares
 *  no formats subpath), and the resolver reads the sentinels structurally,
 *  so the raw spellings converge with the schema door exactly like the real
 *  brands do. FzEmail carries pattern params like the real Email brand — a
 *  param-less named string brand emits an EMPTY runtime check, which would
 *  make its negation unsatisfiable in the value lanes. The pattern is kept
 *  backslash-free on purpose (the text nests through template literals
 *  before reaching tsgo). **/
export const FUZZ_FORMAT_PREAMBLE = [
  'type FzTF<Base, Name extends string, Params extends object> = Base & {readonly __rtFormatName?: Name; readonly __rtFormatParams?: Params};',
  'type FzNot<F extends string | number | bigint> = ([F] extends [string] ? string : [F] extends [number] ? number : bigint) & {readonly __rtNot?: F};',
  `type FzEmail = FzTF<string, 'email', {pattern: {source: '${FUZZ_EMAIL_PATTERN}'; flags: ''}}>;`,
  "type FzUUID = FzTF<string, 'uuid', {version: 'any'}>;",
  "type FzInteger = FzTF<number, 'numberFormat', {integer: true}>;",
  "type FzString<P extends object> = FzTF<string, 'stringFormat', P>;",
  "type FzNumber<P extends object> = FzTF<number, 'numberFormat', P>;",
  // Content leaves — the params must match the translation's lowering EXACTLY
  // (anchored RFC 4648 pattern + baked mock pool for base64; the
  // contentMediaType keyword + pool for JSON content), or the ids diverge on
  // the very first draw. Both are plain `stringFormat`: the content keywords
  // are string PARAMS, not formats of their own.
  "type FzBase64 = FzTF<string, 'stringFormat', {pattern: {source: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'; flags: ''; mockSamples: ['', 'QQ==', 'QUJD', 'SGVsbG8=']}}>;",
  "type FzJson = FzTF<string, 'stringFormat', {contentMediaType: 'application/json'; mockSamples: ['{}', '[]', '\"text\"', '7', 'true', 'null']}>;",
].join('\n');

/** True when any shape in the generated type is a format/not leaf — the
 *  renderers prepend {@link FUZZ_FORMAT_PREAMBLE} exactly then. **/
export function usesFormatLeaves(gen: GeneratedType): boolean {
  let found = false;
  const walk = (shape: TypeShape): void => {
    if (found) return;
    if (shape.kind === 'format' || shape.kind === 'not') {
      found = true;
      return;
    }
    childShapes(shape).forEach(walk);
  };
  for (const decl of gen.decls) {
    if (decl.kind === 'interface' || decl.kind === 'class') decl.props.forEach((p) => walk(p.shape));
    else if (decl.kind === 'type') walk(decl.shape);
  }
  walk(gen.root);
  return found;
}

/** Every direct child shape of a node (shared by the small walkers here). **/
function childShapes(shape: TypeShape): TypeShape[] {
  switch (shape.kind) {
    case 'array':
    case 'set':
      return [shape.elem];
    case 'record':
    case 'promise':
      return [shape.value];
    case 'map':
      return [shape.key, shape.value];
    case 'tuple':
      return shape.elems;
    case 'union':
    case 'intersection':
      return shape.members;
    case 'function':
      return [...shape.params, shape.ret];
    case 'not':
      return [shape.child];
    case 'object':
      return [...shape.props.map((p) => p.shape), ...(shape.index ? [shape.index] : [])];
    default:
      return [];
  }
}

/** The typed-array constructors the generator can emit — a representative
 *  slice (all are non-serialisable `ArrayBufferView`s under DataOnly). **/
export type TypedArrayName = 'Uint8Array' | 'Int32Array' | 'Float64Array';
const TYPED_ARRAY_NAMES: TypedArrayName[] = ['Uint8Array', 'Int32Array', 'Float64Array'];

/** The key kinds a generated index signature can use, alone or as a union
 *  (`[k: number]`, `[k: string | symbol]`, …). All are valid TypeScript; the
 *  resolver SPLITS a union key into one index signature per kind, so the value
 *  generators + the product mock handle each kind independently. **/
export type IndexKeyKind = 'string' | 'number' | 'symbol';
const INDEX_KEY_KINDS: IndexKeyKind[] = ['string', 'number', 'symbol'];

/** A non-empty random subset of {string, number, symbol} — the index key type. **/
function randomIndexKey(): IndexKeyKind[] {
  const chosen = INDEX_KEY_KINDS.filter(() => chance(0.5));
  return chosen.length ? chosen : [pick(INDEX_KEY_KINDS)];
}

/** A call signature on a callable interface (`(a0: P): R`). An interface that
 *  carries one is itself function-like, so DataOnly strips it to `never`. **/
export interface CallSigShape {
  params: TypeShape[];
  ret: TypeShape;
}

export interface PropShape {
  /** Raw property key (may be a non-identifier — renderer quotes it). **/
  name: string;
  optional: boolean;
  readonly: boolean;
  /** Render as a method signature (`m(): R`) rather than `m: (…) => R`. **/
  method: boolean;
  shape: TypeShape;
}

export type Decl =
  // `calls` (when present) makes this a CALLABLE interface — function-like, so
  // DataOnly strips a ref to it the same way it strips a bare function.
  | {kind: 'interface'; name: string; props: PropShape[]; calls?: CallSigShape[]}
  | {kind: 'type'; name: string; shape: TypeShape}
  | {kind: 'class'; name: string; props: PropShape[]}
  | {kind: 'enum'; name: string; members: EnumMember[]};

export interface EnumMember {
  name: string;
  value?: string | number;
}

/** A complete generated type: zero or more named declarations + the root type
 *  expression that the createX<T>() sites target. **/
export interface GeneratedType {
  decls: Decl[];
  root: TypeShape;
}

export interface GenOptions {
  maxDepth: number;
  maxBreadth: number;
  /** Master switch: when false, restrict to the serialisable subset (drives the
   *  strong-oracle sweep); when true, the full adversarial space (adds the broad
   *  edge kinds `any` / `unknown` / `never` / `void` and primitive-branded
   *  intersections). **/
  wild: boolean;
  /** Emit the DataOnly-STRIPPED kinds — `symbol`, functions, property methods,
   *  callable interfaces, `Promise`, `declare class`, and the non-serialisable
   *  natives (`ArrayBuffer` / typed arrays / `DataView`). Orthogonal to `wild`:
   *  the DataOnly fuzz lane sets this true with `wild` false so the contract is
   *  exercised without `any`/`unknown` noise. **/
  nonDataTypes: boolean;
  /** Emit non-identifier property keys sometimes. **/
  weirdKeys: boolean;
  /** Generate named decls (interfaces / classes / enums), including recursive
   *  interfaces. **/
  named: boolean;
  /** Emit the JSON Schema STRUCTURAL surface: formattedArray / formattedObject
   *  params on arrays and records, and exclusive (oneOf) unions over
   *  disjoint-by-construction branches. ONLY the jsonschema id-convergence
   *  lane turns this on — the value lanes' generators don't enforce the
   *  constraints, so a valid-value draw could violate them. **/
  structuralFormats?: boolean;
}

export const WILD_GEN_OPTIONS: GenOptions = {
  maxDepth: 4,
  maxBreadth: 4,
  wild: true,
  nonDataTypes: true,
  weirdKeys: true,
  named: true,
};

/** Serialisable-only preset — the strong value oracles (O1/O2/O5/O6) need clean
 *  round-trippable types. Still includes recursive interfaces, Map/Set/RegExp,
 *  records, intersections — everything that round-trips. **/
export const DATA_GEN_OPTIONS: GenOptions = {
  maxDepth: 4,
  maxBreadth: 4,
  wild: false,
  nonDataTypes: false,
  weirdKeys: true,
  named: true,
};

/** DataOnly-contract preset — clean serialisable base PLUS the stripped kinds
 *  (symbol / function / method / callable interface / Promise / class / native),
 *  with `wild` off so the lane isn't drowned in `any`/`unknown`. Drives the
 *  DataOnly serialize-vs-drop-vs-fail oracle. **/
export const NONDATA_GEN_OPTIONS: GenOptions = {
  maxDepth: 4,
  maxBreadth: 4,
  wild: false,
  nonDataTypes: true,
  weirdKeys: true,
  named: true,
};

// keep DEFAULT pointed at the wild space — the headline behaviour.
export const DEFAULT_GEN_OPTIONS = WILD_GEN_OPTIONS;

// --- seeded helpers (all over the swapped-in Math.random) ---

function rnd(): number {
  return Math.random();
}
function int(maxExclusive: number): number {
  return Math.floor(rnd() * maxExclusive);
}
function pick<T>(items: readonly T[]): T {
  return items[int(items.length)];
}
function chance(p: number): boolean {
  return rnd() < p;
}

const WEIRD_KEYS = ['a-b', '1x', 'has space', 'class', '__proto__like', 'k.dot', '9', 'with"quote'];

// Generation context — collects named decls and bounds recursion. `refs` holds
// the decls that are in scope as `ref` targets (interfaces/classes/enums).
interface Ctx {
  opts: GenOptions;
  decls: Decl[];
  refs: {name: string; kind: Decl['kind']}[];
  nameSeq: number;
}

function freshName(ctx: Ctx, prefix: string): string {
  return `${prefix}${ctx.nameSeq++}`;
}

/** Generate a whole type: a handful of named decls (some recursive) + a root.
 *  The decls are generated up front and the root references them only some of the
 *  time, so a decl the root never reaches would be an ORPHAN declaration — emitted
 *  into the source but unrelated to the type the createX<root>() site actually
 *  targets, i.e. pure noise. `pruneUnreachableDecls` drops those, so every
 *  generated type is a single coherent graph rooted at `root` (the decls that
 *  survive are exactly the named types the root depends on). **/
export function genType(opts: GenOptions = DEFAULT_GEN_OPTIONS): GeneratedType {
  const ctx: Ctx = {opts, decls: [], refs: [], nameSeq: 0};
  if (opts.named) {
    const declCount = int(3); // 0–2 named decls
    for (let i = 0; i < declCount; i++) genDecl(ctx);
  }
  const root = genShape(ctx, 0);
  return pruneUnreachableDecls({decls: ctx.decls, root});
}

/** Drop every declared type the root cannot reach (transitively, through
 *  decl-to-decl references). Keeps the type coherent: no orphan declarations
 *  floating beside a root that never uses them. **/
function pruneUnreachableDecls(gen: GeneratedType): GeneratedType {
  if (gen.decls.length === 0) return gen;
  const byName = new Map(gen.decls.map((decl) => [decl.name, decl] as const));
  const reached = new Set<string>();
  const rootRefs = new Set<string>();
  collectRefs(gen.root, rootRefs);
  const stack = [...rootRefs];
  while (stack.length) {
    const name = stack.pop()!;
    if (reached.has(name) || !byName.has(name)) continue;
    reached.add(name);
    for (const ref of declRefs(byName.get(name)!)) stack.push(ref);
  }
  if (reached.size === gen.decls.length) return gen; // all referenced — nothing to prune
  return {decls: gen.decls.filter((decl) => reached.has(decl.name)), root: gen.root};
}

function genDecl(ctx: Ctx): void {
  const choice = ctx.opts.nonDataTypes
    ? pick(['interface', 'interface', 'class', 'enum'] as const)
    : pick(['interface', 'interface', 'enum'] as const);
  if (choice === 'enum') {
    const name = freshName(ctx, 'E');
    const count = 1 + int(4);
    const stringValued = chance(0.5);
    const members: EnumMember[] = [];
    // Either all string-valued, or all auto-numbered (member i === i) — keeps
    // the runtime value of each member trivially computable for value-gen.
    for (let i = 0; i < count; i++) {
      members.push(stringValued ? {name: `M${i}`, value: `e${i}`} : {name: `M${i}`});
    }
    ctx.decls.push({kind: 'enum', name, members});
    ctx.refs.push({name, kind: 'enum'});
    return;
  }
  if (choice === 'class') {
    const name = freshName(ctx, 'C');
    // Register before generating members so a member can reference the class.
    ctx.refs.push({name, kind: 'class'});
    const props = genMembers(ctx, 1, name, true);
    ctx.decls.push({kind: 'class', name, props});
    return;
  }
  // interface — register the name first so props can self-reference (recursive).
  const name = freshName(ctx, 'N');
  ctx.refs.push({name, kind: 'interface'});
  const props = genMembers(ctx, 1, name, ctx.opts.nonDataTypes);
  // Callable-interface GENERATION stays disabled. The F2 product inconsistency is
  // fixed (validate and the serializers now agree: a callable interface is
  // function-like everywhere — typeof-function at the root, dropped at a
  // property; pinned by callable_interface_dataonly_test.go). Re-enabling
  // generation, however, surfaces a SEPARATE emit-pipeline bug: a complex
  // callable interface (a call signature whose params/returns pull in `any` /
  // methods / non-serializable intersections) wires its now-alwaysThrow factory
  // with an UNCONTROLLED error (`reading 'fn'`) and leaves a binary site
  // unresolved. That dependency-linking bug is tracked as a follow-up; the
  // `calls` plumbing stays so it can be re-enabled once it lands.
  ctx.decls.push({kind: 'interface', name, props, calls: undefined});
}

// Generate object/interface/class members. `selfName`, when set, is in scope as
// a recursive ref target — but ONLY ever placed in inhabitable positions
// (optional props or array elements) so values stay finite.
function genMembers(
  ctx: Ctx,
  depth: number,
  selfName: string | undefined,
  allowMethods: boolean,
  forcedShape?: TypeShape
): PropShape[] {
  const count = 1 + int(ctx.opts.maxBreadth);
  const props: PropShape[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name = `p${i}`;
    if (ctx.opts.weirdKeys && chance(0.12)) {
      const weird = pick(WEIRD_KEYS);
      if (!used.has(weird)) name = weird;
    }
    if (used.has(name)) continue;
    used.add(name);
    const optional = chance(0.35);
    const method = !forcedShape && allowMethods && ctx.opts.nonDataTypes && chance(0.15);
    let shape: TypeShape;
    if (forcedShape) {
      // The enclosing object has a `string`-keyed index, so every named prop
      // must be assignable to the index value type — reuse it verbatim so the
      // object stays valid TypeScript.
      shape = forcedShape;
    } else if (method) {
      shape = {kind: 'function', params: genParams(ctx, depth), ret: genShape(ctx, depth + 1)};
    } else if (selfName && optional && chance(0.5)) {
      // recursive self-reference through an optional prop (always inhabitable)
      shape = chance(0.5) ? {kind: 'ref', name: selfName} : {kind: 'array', elem: {kind: 'ref', name: selfName}};
    } else {
      shape = genShape(ctx, depth + 1);
    }
    props.push({name, optional, readonly: chance(0.2), method, shape});
  }
  // bias toward at least one recursive array prop for declared self-types (only
  // when props are unconstrained — a string-keyed index would reject it)
  if (selfName && !forcedShape && chance(0.4)) {
    props.push({
      name: `kids${props.length}`,
      optional: false,
      readonly: false,
      method: false,
      shape: {kind: 'array', elem: {kind: 'ref', name: selfName}},
    });
  }
  return props;
}

function genParams(ctx: Ctx, depth: number): TypeShape[] {
  const count = int(3);
  const params: TypeShape[] = [];
  for (let i = 0; i < count; i++) params.push(genShape(ctx, depth + 1));
  return params;
}

/** Generate a shape at `depth`, branching into compounds until maxDepth. **/
export function genShape(ctx: Ctx, depth: number): TypeShape {
  if (depth >= ctx.opts.maxDepth || chance(0.4)) return genLeaf(ctx);
  const builders: Array<() => TypeShape> = [
    () => withArrayStructural(ctx, {kind: 'array', elem: genShape(ctx, depth + 1)}),
    () => genTuple(ctx, depth),
    () => genObject(ctx, depth),
    () => genUnion(ctx, depth),
    () => withRecordStructural(ctx, {kind: 'record', value: genShape(ctx, depth + 1)}),
  ];
  if (ctx.opts.structuralFormats) builders.push(() => genOneOf(ctx, depth));
  // Intersections + Map/Set round-trip, so every preset can emit them (the
  // primitive-brand arm inside genIntersection stays gated on `wild`).
  builders.push(
    () => genIntersection(ctx, depth),
    () => ({kind: 'map', key: pick<TypeShape>([{kind: 'string'}, {kind: 'number'}]), value: genShape(ctx, depth + 1)}),
    () => ({kind: 'set', elem: genShape(ctx, depth + 1)})
  );
  // Promise + function are DataOnly-stripped — gated on nonDataTypes.
  if (ctx.opts.nonDataTypes) {
    builders.push(
      () => ({kind: 'promise', value: genShape(ctx, depth + 1)}),
      () => ({kind: 'function', params: genParams(ctx, depth), ret: genShape(ctx, depth + 1)})
    );
  }
  // sometimes reference a declared type instead of generating inline (class refs
  // only exist when nonDataTypes generated a `declare class`).
  const usableRefs = ctx.refs.filter((r) => (ctx.opts.nonDataTypes ? true : r.kind !== 'class'));
  if (usableRefs.length && chance(0.3)) {
    const ref = pick(usableRefs);
    return {kind: 'ref', name: ref.name};
  }
  return pick(builders)();
}

function genLeaf(ctx: Ctx): TypeShape {
  const serial: Array<() => TypeShape> = [
    () => ({kind: 'number'}),
    () => ({kind: 'string'}),
    () => ({kind: 'boolean'}),
    () => ({kind: 'null'}),
    () => ({kind: 'bigint'}),
    () => ({kind: 'date'}),
    () => ({kind: 'regexp'}),
    () => ({kind: 'undefined'}),
    () => genLiteral(),
    // Format brands + their negation — serialisable (JSON codecs see the
    // base kind), validate-relevant, and covered by the jsonschema lane's
    // convergence oracle.
    () => ({kind: 'format', name: pick(FORMAT_LEAF_NAMES)}),
    () => ({kind: 'not', child: {kind: 'format', name: pick(FORMAT_LEAF_NAMES)}}),
  ];
  // Broad / edge kinds — adversarial but not "non-data" per se (any/unknown are
  // passthrough; never/void have their own arms). Gated on `wild`.
  const broad: Array<() => TypeShape> = [
    () => ({kind: 'any'}),
    () => ({kind: 'unknown'}),
    () => ({kind: 'never'}),
    () => ({kind: 'void'}),
  ];
  // DataOnly-stripped leaves — symbol + the non-serialisable natives. Gated on
  // nonDataTypes.
  const nonData: Array<() => TypeShape> = [
    () => ({kind: 'symbol'}),
    () => ({kind: 'arraybuffer'}),
    () => ({kind: 'sharedarraybuffer'}),
    () => ({kind: 'dataview'}),
    () => ({kind: 'typedarray', name: pick(TYPED_ARRAY_NAMES)}),
  ];
  // refs to enums/classes are leaf-ish (class refs only when nonDataTypes).
  const refLeaves = ctx.refs
    .filter((r) => r.kind === 'enum' || (ctx.opts.nonDataTypes && r.kind === 'class'))
    .map((r) => () => ({kind: 'ref', name: r.name}) as TypeShape);
  const pool = [...serial, ...(ctx.opts.wild ? broad : []), ...(ctx.opts.nonDataTypes ? nonData : []), ...refLeaves];
  return pick(pool)();
}

function genLiteral(): TypeShape {
  const flavour = int(3);
  if (flavour === 0) return {kind: 'literal', value: pick(['on', 'off', 'red', 'green', 'A', 'B'])};
  if (flavour === 1) return {kind: 'literal', value: pick([0, 1, 7, 42, -3])};
  return {kind: 'literal', value: chance(0.5)};
}

/** Sometimes decorate an array / record with structural params (jsonschema
 *  lane only). Small bounds; the convergence oracle never draws values. **/
function withArrayStructural(ctx: Ctx, shape: TypeShape & {kind: 'array'}): TypeShape {
  if (!ctx.opts.structuralFormats || !chance(0.3)) return shape;
  const structural: ArrayStructural = {};
  if (chance(0.6)) structural.uniqueItems = true;
  if (chance(0.6)) structural.maxItems = 1 + int(4);
  // Child-schema slot: the id fold is satisfiability-blind, so contains may
  // stack with any elem / bound combination (this lane never draws values).
  if (chance(0.4)) structural.contains = {min: 1 + int(2), ...(chance(0.4) ? {max: 4 + int(3)} : {})};
  if (structural.uniqueItems === undefined && structural.maxItems === undefined && structural.contains === undefined) {
    structural.uniqueItems = true;
  }
  return {...shape, structural};
}
function withRecordStructural(ctx: Ctx, shape: TypeShape & {kind: 'record'}): TypeShape {
  if (!ctx.opts.structuralFormats || !chance(0.3)) return shape;
  const structural: ObjectStructural = {};
  if (chance(0.6)) structural.minProperties = int(3);
  if (chance(0.6)) structural.maxProperties = 3 + int(4);
  // Key-constraint sentinels, one at a time (fixed vocabularies).
  if (chance(0.35)) structural.patternProps = true;
  else if (chance(0.35)) structural.propNames = true;
  if (Object.keys(structural).length === 0) structural.minProperties = 1;
  return {...shape, structural};
}

/** An exclusive (oneOf) union over DISJOINT-BY-CONSTRUCTION branches: each
 *  branch draws from a different base kind, so exactly-one holds trivially
 *  and the id-convergence oracle covers the carrier encoding + the `oo{…}`
 *  fold without any overlap bookkeeping. **/
function genOneOf(ctx: Ctx, depth: number): TypeShape {
  const pool: Array<() => TypeShape> = [
    () => ({kind: 'string'}),
    () => ({kind: 'number'}),
    () => ({kind: 'boolean'}),
    () => ({
      kind: 'object',
      props: [{name: 'tag', optional: false, readonly: false, method: false, shape: genShape(ctx, depth + 1)}],
    }),
    () => ({kind: 'array', elem: genShape(ctx, depth + 1)}),
  ];
  const count = 2 + int(2);
  const picked = new Set<number>();
  while (picked.size < count) picked.add(int(pool.length));
  const members = [...picked].map((i) => pool[i]());
  return {kind: 'union', members, exclusive: true};
}

function genTuple(ctx: Ctx, depth: number): TypeShape {
  const length = 1 + int(ctx.opts.maxBreadth);
  const elems: TypeShape[] = [];
  for (let i = 0; i < length; i++) elems.push(genShape(ctx, depth + 1));
  return {kind: 'tuple', elems};
}

function genObject(ctx: Ctx, depth: number): TypeShape {
  // Generate the index signature FIRST, with lower probability than a regular
  // prop. A key set containing `string` constrains EVERY named (string-keyed)
  // property to the index value type (TS2411); when one is present the named
  // props reuse the index value shape so the object stays valid, otherwise
  // string-named props are unconstrained and get free types. Any residual
  // invalid combo (e.g. a numeric weird-key prop under a number-only key) is
  // dropped by the runner's TS-validity gate.
  let index: TypeShape | undefined;
  let indexKey: IndexKeyKind[] | undefined;
  if (chance(0.15)) {
    indexKey = randomIndexKey();
    index = genShape(ctx, depth + 1);
  }
  const forcedPropShape = indexKey?.includes('string') ? index : undefined;
  const props = genMembers(ctx, depth, undefined, ctx.opts.wild, forcedPropShape);
  return {kind: 'object', props, index, indexKey};
}

// Unions are kept value-level DISJOINT so the strong oracles stay sound on the
// serialisable subset: distinct literals, distinct primitive kinds, or tagged
// objects with a distinct discriminant literal.
function genUnion(ctx: Ctx, depth: number): TypeShape {
  const flavour = pick(['literals', 'primitives', 'tagged'] as const);
  const count = 2 + int(Math.max(1, ctx.opts.maxBreadth - 1));
  if (flavour === 'literals') return {kind: 'union', members: genDistinctLiterals(count)};
  if (flavour === 'primitives') return {kind: 'union', members: genDistinctPrimitives(count)};
  return {kind: 'union', members: genTaggedObjects(ctx, count, depth)};
}

function genDistinctLiterals(count: number): TypeShape[] {
  const pool = ['la', 'lb', 'lc', 'ld', 'le', 'lf'];
  const members: TypeShape[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) members.push({kind: 'literal', value: pool[i]});
  return members.length >= 2
    ? members
    : [
        {kind: 'literal', value: 'la'},
        {kind: 'literal', value: 'lb'},
      ];
}

function genDistinctPrimitives(count: number): TypeShape[] {
  const kinds: TypeShape[] = [{kind: 'string'}, {kind: 'number'}, {kind: 'boolean'}, {kind: 'bigint'}];
  const shuffled = [...kinds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(2, Math.min(count, shuffled.length)));
}

function genTaggedObjects(ctx: Ctx, count: number, depth: number): TypeShape[] {
  const members: TypeShape[] = [];
  const n = Math.min(count, 4);
  for (let i = 0; i < n; i++) {
    const props: PropShape[] = [
      {name: 'kind', optional: false, readonly: false, method: false, shape: {kind: 'literal', value: `t${i}`}},
    ];
    const extra = int(ctx.opts.maxBreadth);
    for (let k = 0; k < extra; k++) {
      props.push({name: `f${k}`, optional: chance(0.3), readonly: false, method: false, shape: genShape(ctx, depth + 2)});
    }
    members.push({kind: 'object', props});
  }
  return members;
}

// Intersections of OBJECTS with DISJOINT property names per member, so the merge
// is a clean structural union (always inhabitable, and no conflicting-property
// `never`s — those send the checker into a pathological state). Mixing in a
// primitive (wild only) is a cheap `string & {…}` brand, not a conflict.
function genIntersection(ctx: Ctx, depth: number): TypeShape {
  const count = 2 + int(2);
  const members: TypeShape[] = [];
  for (let i = 0; i < count; i++) {
    const props: PropShape[] = [];
    const fields = 1 + int(ctx.opts.maxBreadth);
    for (let k = 0; k < fields; k++) {
      props.push({
        name: `m${i}_${k}`,
        optional: chance(0.3),
        readonly: chance(0.2),
        method: false,
        shape: genShape(ctx, depth + 2),
      });
    }
    members.push({kind: 'object', props});
  }
  if (ctx.opts.wild && chance(0.25)) members.push(pick<TypeShape>([{kind: 'string'}, {kind: 'number'}]));
  return {kind: 'intersection', members};
}

// =============================================================================
// Rendering — TypeShape / Decl → TS source.
// =============================================================================

function isIdent(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
function renderKey(name: string): string {
  return isIdent(name) ? name : JSON.stringify(name);
}

/** The __rtFormatParams type-literal text for a structural decoration —
 *  key order fixed so a seed replays byte-identically. **/
function structuralParamsText(structural: ArrayStructural | ObjectStructural): string {
  const parts: string[] = [];
  for (const key of ['uniqueItems', 'maxItems', 'minProperties', 'maxProperties'] as const) {
    const value = (structural as Record<string, unknown>)[key];
    if (value !== undefined) parts.push(`${key}: ${String(value)}`);
  }
  return `{${parts.join('; ')}}`;
}

export function renderType(shape: TypeShape): string {
  switch (shape.kind) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'bigint':
    case 'symbol':
    case 'any':
    case 'unknown':
    case 'never':
    case 'void':
      return shape.kind;
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'date':
      return 'Date';
    case 'regexp':
      return 'RegExp';
    case 'literal':
      return typeof shape.value === 'string' ? JSON.stringify(shape.value) : String(shape.value);
    case 'array': {
      let text = `Array<${renderType(shape.elem)}>`;
      const arrayStructural = shape.structural;
      if (arrayStructural && (arrayStructural.uniqueItems || arrayStructural.maxItems !== undefined)) {
        text = `(${text} & {readonly __rtFormatName?: 'formattedArray'; readonly __rtFormatParams?: ${structuralParamsText(arrayStructural)}})`;
      }
      if (arrayStructural?.contains) {
        const maxText = arrayStructural.contains.max !== undefined ? `; readonly rt$max: ${arrayStructural.contains.max}` : '';
        text = `(${text} & {readonly __rtContains?: {readonly rt$child: number; readonly rt$min: ${arrayStructural.contains.min}${maxText}}})`;
      }
      return text;
    }
    case 'tuple':
      return `[${shape.elems.map(renderType).join(', ')}]`;
    case 'record': {
      let text = `Record<string, ${renderType(shape.value)}>`;
      const recordStructural = shape.structural;
      if (recordStructural && (recordStructural.minProperties !== undefined || recordStructural.maxProperties !== undefined)) {
        text = `(${text} & {readonly __rtFormatName?: 'formattedObject'; readonly __rtFormatParams?: ${structuralParamsText(recordStructural)}})`;
      }
      if (recordStructural?.patternProps) {
        text =
          `(${text} & {readonly __rtPatternProps?: {readonly '^n_': {readonly rt$key: string & ` +
          `{readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {pattern: {source: '^n_'; flags: ''}}}; ` +
          `readonly rt$value: number}}})`;
      }
      if (recordStructural?.propNames) {
        text =
          `(${text} & {readonly __rtPropNames?: (string & ` +
          `{readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 3}})})`;
      }
      return text;
    }
    case 'map':
      return `Map<${renderType(shape.key)}, ${renderType(shape.value)}>`;
    case 'set':
      return `Set<${renderType(shape.elem)}>`;
    case 'promise':
      return `Promise<${renderType(shape.value)}>`;
    case 'function':
      return `((${shape.params.map((p, i) => `a${i}: ${renderType(p)}`).join(', ')}) => ${renderType(shape.ret)})`;
    case 'arraybuffer':
      return 'ArrayBuffer';
    case 'sharedarraybuffer':
      return 'SharedArrayBuffer';
    case 'dataview':
      return 'DataView';
    case 'typedarray':
      return shape.name;
    case 'format':
      return FORMAT_LEAVES[shape.name].tsText;
    case 'not':
      return `FzNot<${renderType(shape.child)}>`;
    case 'ref':
      return shape.name;
    case 'union': {
      if (shape.exclusive) {
        // The OneOf carrier spelling: every branch (the disjoint generator
        // emits no nullish branches) intersects the optional tuple prop.
        const memberTexts = shape.members.map(renderType);
        const tuple = `[${memberTexts.join(', ')}]`;
        return `(${memberTexts.map((text) => `(${text} & {readonly __rtOneOf?: ${tuple}})`).join(' | ')})`;
      }
      return `(${shape.members.map(renderType).join(' | ')})`;
    }
    case 'intersection':
      return `(${shape.members.map(renderType).join(' & ')})`;
    case 'object': {
      const parts = shape.props.map(renderProp);
      if (shape.index) {
        // The key kind set comes from the generator (string / number / symbol or
        // any union). genObject keeps it valid: a `string` key forces the named
        // props to the index value type. The tsValidate gate drops any residual
        // invalid combo. Legacy fixtures without `indexKey` default to `string`.
        const kinds = shape.indexKey ?? ['string'];
        parts.push(`[k: ${kinds.join(' | ')}]: ${renderType(shape.index)}`);
      }
      return parts.length ? `{${parts.join('; ')}}` : '{}';
    }
  }
}

function renderProp(prop: PropShape): string {
  const ro = prop.readonly ? 'readonly ' : '';
  const opt = prop.optional ? '?' : '';
  if (prop.method && prop.shape.kind === 'function') {
    const fn = prop.shape;
    return `${ro}${renderKey(prop.name)}${opt}(${fn.params.map((p, i) => `a${i}: ${renderType(p)}`).join(', ')}): ${renderType(fn.ret)}`;
  }
  return `${ro}${renderKey(prop.name)}${opt}: ${renderType(prop.shape)}`;
}

export function renderDecl(decl: Decl): string {
  switch (decl.kind) {
    case 'interface': {
      const callSigs = (decl.calls ?? []).map(
        (sig) => `(${sig.params.map((p, i) => `a${i}: ${renderType(p)}`).join(', ')}): ${renderType(sig.ret)}`
      );
      const parts = [...callSigs, ...decl.props.map(renderProp)];
      return `interface ${decl.name} {${parts.join('; ')}}`;
    }
    case 'type':
      return `type ${decl.name} = ${renderType(decl.shape)};`;
    case 'class':
      // `declare class` — type-only, no method bodies needed for the scan.
      return `declare class ${decl.name} {${decl.props.map(renderProp).join('; ')}}`;
    case 'enum':
      return `enum ${decl.name} {${decl.members
        .map((m) =>
          m.value === undefined ? m.name : `${m.name} = ${typeof m.value === 'string' ? JSON.stringify(m.value) : m.value}`
        )
        .join(', ')}}`;
  }
}

/** Render the decls block + the root type expression for a generated type.
 *  When the type carries format/not leaves, the decls block LEADS with the
 *  fixture preamble (imports + raw-brand aliases), so every lane's
 *  `${decls}` interpolation stays correct with no per-harness wiring. **/
export function renderGenerated(gen: GeneratedType): {decls: string; rootExpr: string} {
  const decls = gen.decls.map(renderDecl).join('\n');
  const withPreamble = usesFormatLeaves(gen) ? `${FUZZ_FORMAT_PREAMBLE}\n${decls}` : decls;
  return {decls: withPreamble, rootExpr: renderType(gen.root)};
}

/** Short human-readable summary for titles / logs. **/
export function describeType(gen: GeneratedType): string {
  const d = gen.decls.length ? `[${gen.decls.length}d] ` : '';
  return d + describeShape(gen.root);
}

export function describeShape(shape: TypeShape, depth = 0): string {
  if (depth > 2) return '…';
  switch (shape.kind) {
    case 'array':
      return `${describeShape(shape.elem, depth + 1)}[]`;
    case 'tuple':
      return `[${shape.elems.map((s) => describeShape(s, depth + 1)).join(',')}]`;
    case 'object':
      return `{${shape.props.length}${shape.index ? '+idx' : ''}}`;
    case 'record':
      return `Rec<${describeShape(shape.value, depth + 1)}>`;
    case 'map':
      return `Map<${describeShape(shape.key, depth + 1)},${describeShape(shape.value, depth + 1)}>`;
    case 'set':
      return `Set<${describeShape(shape.elem, depth + 1)}>`;
    case 'promise':
      return `Promise<${describeShape(shape.value, depth + 1)}>`;
    case 'function':
      return `fn(${shape.params.length})`;
    case 'union':
      return `(${shape.members.map((s) => describeShape(s, depth + 1)).join('|')})`;
    case 'intersection':
      return `(${shape.members.map((s) => describeShape(s, depth + 1)).join('&')})`;
    case 'literal':
      return typeof shape.value === 'string' ? `'${shape.value}'` : String(shape.value);
    case 'format':
      return `F:${shape.name}`;
    case 'not':
      return `¬${describeShape(shape.child, depth + 1)}`;
    case 'ref':
      return shape.name;
    default:
      return shape.kind;
  }
}

// --- ref-graph analysis (recursion detection) ---

function collectRefs(shape: TypeShape, out: Set<string>): void {
  switch (shape.kind) {
    case 'ref':
      out.add(shape.name);
      return;
    case 'array':
    case 'set':
      return collectRefs(shape.elem, out);
    case 'record':
    case 'promise':
      return collectRefs(shape.value, out);
    case 'map':
      collectRefs(shape.key, out);
      collectRefs(shape.value, out);
      return;
    case 'tuple':
      shape.elems.forEach((s) => collectRefs(s, out));
      return;
    case 'union':
    case 'intersection':
      shape.members.forEach((s) => collectRefs(s, out));
      return;
    case 'function':
      shape.params.forEach((s) => collectRefs(s, out));
      collectRefs(shape.ret, out);
      return;
    case 'not':
      return collectRefs(shape.child, out);
    case 'object':
      shape.props.forEach((p) => collectRefs(p.shape, out));
      if (shape.index) collectRefs(shape.index, out);
      return;
  }
}

function declRefs(decl: Decl): Set<string> {
  const out = new Set<string>();
  if (decl.kind === 'interface' || decl.kind === 'class') {
    decl.props.forEach((p) => collectRefs(p.shape, out));
    if (decl.kind === 'interface' && decl.calls) {
      for (const sig of decl.calls) {
        sig.params.forEach((p) => collectRefs(p, out));
        collectRefs(sig.ret, out);
      }
    }
  } else if (decl.kind === 'type') collectRefs(decl.shape, out);
  return out;
}

/** True when the type's declarations contain a reference cycle (a recursive /
 *  circular type). The in-process harness linker can't faithfully execute a
 *  cyclic function graph (the real pipeline's CircularRefs suite covers that),
 *  so the runner restricts recursive types to the resolver/emit oracles. **/
export function isRecursive(gen: GeneratedType): boolean {
  const byName = new Map(gen.decls.map((d) => [d.name, d] as const));
  const reachesSelf = (start: string): boolean => {
    const seen = new Set<string>();
    const stack = [...declRefs(byName.get(start)!)];
    while (stack.length) {
      const name = stack.pop()!;
      if (name === start) return true;
      if (seen.has(name) || !byName.has(name)) continue;
      seen.add(name);
      for (const ref of declRefs(byName.get(name)!)) stack.push(ref);
    }
    return false;
  };
  return gen.decls.some((d) => (d.kind === 'interface' || d.kind === 'class' || d.kind === 'type') && reachesSelf(d.name));
}

/** Total node count across decls + root — used by tests to bound size. **/
export function countNodes(gen: GeneratedType): number {
  let total = 0;
  const walk = (shape: TypeShape): void => {
    total++;
    switch (shape.kind) {
      case 'array':
      case 'set':
        walk(shape.kind === 'array' ? shape.elem : shape.elem);
        break;
      case 'record':
      case 'promise':
        walk(shape.value);
        break;
      case 'map':
        walk(shape.key);
        walk(shape.value);
        break;
      case 'tuple':
        shape.elems.forEach(walk);
        break;
      case 'union':
      case 'intersection':
        shape.members.forEach(walk);
        break;
      case 'function':
        shape.params.forEach(walk);
        walk(shape.ret);
        break;
      case 'not':
        walk(shape.child);
        break;
      case 'object':
        shape.props.forEach((p) => walk(p.shape));
        if (shape.index) walk(shape.index);
        break;
    }
  };
  for (const decl of gen.decls) {
    if (decl.kind === 'interface' || decl.kind === 'class') {
      decl.props.forEach((p) => walk(p.shape));
      if (decl.kind === 'interface' && decl.calls)
        for (const sig of decl.calls) {
          sig.params.forEach(walk);
          walk(sig.ret);
        }
    } else if (decl.kind === 'type') walk(decl.shape);
    else total++;
  }
  walk(gen.root);
  return total;
}
