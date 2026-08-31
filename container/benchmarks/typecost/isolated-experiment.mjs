// Isolated, FAITHFULNESS-GATED type-cost experiment — the Path-B inner-loop tool
// for designing a type-level change BEFORE wiring it into the real builders.
//
// Unlike typecost.mjs (which measures the real competitor cases end-to-end), this
// harness compiles tiny self-contained probes that isolate ONE type-level helper
// (the `ObjectType<C>` assembly, the `union` overload shape, …) and compares
// candidate formulations head-to-head. Every measurement passes through a
// FAITHFULNESS GATE: the recovered type must be mutually assignable with a
// hand-written `Expected` type, so a candidate that scores a cheaper instantiation
// count by silently WIDENING a nested type to `unknown`/`any` is flagged (✗), never
// counted as a win. (Value-only forcing — what typecost.mjs does — cannot catch
// that: any value is assignable to `unknown`.)
//
// Run (after `pnpm install`, so `typescript` resolves from the root devDep):
//   node container/benchmarks/typecost/isolated-experiment.mjs
//
// Findings this reproduces:
//   1. Removing the InjectRunTypeId<…> marker param changes the count by 0
//      (it is optional+omitted → never materialized at type-check time).
//   2. A faithful lazy/TypeBox-style carrier is NOT cheaper (≈ same or worse).
//   3. A tiered ObjectType<C> cuts all-required ~73%, optional-only ~30%,
//      readonly-only ~30%, mixed ~break-even — all faithful.
//   3b. `Flatten`ing each modifier tier's group-intersection into one object
//      literal (so InferType reads `{a; b?}`, never `{a} & {b?}`) is a further
//      ~4–9% saving on the optional/readonly/mixed profiles — flattening the
//      intersection is cheaper to instantiate + consume than carrying it, so the
//      DX win and the type-cost win point the same way.
//   4. Widening union overloads 4→8 cuts an 8-arm union ~32% — faithful.
import ts from 'typescript';

const OPTIONS = {
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  lib: ['lib.esnext.d.ts'],
  types: [],
};
const FILE = '/__isolated_probe.ts';

function compile(text) {
  const host = ts.createCompilerHost(OPTIONS, true);
  const baseGet = host.getSourceFile.bind(host);
  const cache = new Map();
  host.getSourceFile = (fn, lang, onErr, should) => {
    if (fn === FILE) return ts.createSourceFile(fn, text, lang, true, ts.ScriptKind.TS);
    let cached = cache.get(fn);
    if (!cached) {
      cached = baseGet(fn, lang, onErr, should);
      if (cached) cache.set(fn, cached);
    }
    return cached;
  };
  host.fileExists = (f) => f === FILE || ts.sys.fileExists(f);
  host.readFile = (f) => (f === FILE ? text : ts.sys.readFile(f));
  const program = ts.createProgram([FILE], OPTIONS, host);
  const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error);
  return {count: program.getInstantiationCount(), errors};
}

// Shared machinery — faithful to packages/run-types/src (markers.ts,
// runtypes/types.ts, schema/static.ts). The leaf/array/union/propMod/optional
// builders are the carriers the OBJECT forms below compose.
const MACHINERY = `
type InjectRunTypeId<T> = string & { readonly __rtInjectRunTypeIdBrand?: T };
type CompTimeArgs<T> = T & { readonly __rtCompTimeArgsBrand?: never };
interface RunType<T = unknown> { id: string; readonly __rtType?: { t: T }; [x: string]: unknown; }
type InferType<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT;
type FieldOf<V> = V extends { __propMod: any; __field: unknown } ? InferType<V['__field']> : InferType<V>;
type IsOptional<V> = V extends { __propMod: { optional: true } } ? true : false;
type IsReadonly<V> = V extends { __propMod: { readonly: true } } ? true : false;
declare function string(id?: InjectRunTypeId<string>): RunType<string>;
declare function number(id?: InjectRunTypeId<number>): RunType<number>;
declare function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean>;
declare function literal<const V extends string | number | boolean>(v: V, id?: InjectRunTypeId<V>): RunType<V>;
declare function array<T>(item: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
declare function propMod<const M, const F>(m: CompTimeArgs<M>, f: CompTimeArgs<F>): { __propMod: M; __field: F };
declare function optional<const F>(f: CompTimeArgs<F>): { __propMod: { optional: true }; __field: F };
declare function ro<const F>(f: CompTimeArgs<F>): { __propMod: { readonly: true }; __field: F };
declare function optro<const F>(f: CompTimeArgs<F>): { __propMod: { optional: true; readonly: true }; __field: F };
`;

// The CURRENT 4-way Pick-group intersection — copied verbatim from static.ts.
const OBJ_4WAY = `{
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
} & {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? never : K) : never]?: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? K : never) : never]?: FieldOf<C[K]>;
}`;

// Each form defines `ObjectType<C>` + the `object` builder + `union`.
const OBJECT_FORMS = {
  current: `
type ObjectType<C> = ${OBJ_4WAY};
declare function object<const C extends Record<string, unknown>>(c: CompTimeArgs<C>, id?: InjectRunTypeId<ObjectType<C>>): RunType<ObjectType<C>>;
declare function union<const T extends readonly RunType[]>(m: CompTimeArgs<T>, id?: InjectRunTypeId<UnionOf<T>>): RunType<UnionOf<T>>;
type UnionOf<T extends readonly RunType[]> = T extends readonly [infer H extends RunType, ...infer R extends readonly RunType[]] ? InferType<H> | UnionOf<R> : never;`,

  // SHIPPED (static.ts): probe the modifier profile ONCE, pick the leanest faithful
  // map, and `Flatten` each modifier tier's group-intersection back into a single
  // object literal so `InferType` reads `{a; b?}` not `{a} & {b?}` — measurably
  // CHEAPER than leaving the raw intersection, not just cosmetic.
  tiered: `
type AnyOptional<C> = true extends { [K in keyof C]: IsOptional<C[K]> }[keyof C] ? true : false;
type AnyReadonly<C> = true extends { [K in keyof C]: IsReadonly<C[K]> }[keyof C] ? true : false;
type Flatten<T> = { [K in keyof T]: T[K] };
type ObjAllRequired<C> = { -readonly [K in keyof C]: FieldOf<C[K]> };
type ObjOptionalOnly<C> = Flatten<{
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? K : never]?: FieldOf<C[K]>;
}>;
type ObjReadonlyOnly<C> = Flatten<{
  -readonly [K in keyof C as IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
}>;
type ObjMixed<C> = Flatten<${OBJ_4WAY}>;
type ObjectType<C> =
  AnyOptional<C> extends false
    ? (AnyReadonly<C> extends false ? ObjAllRequired<C> : ObjReadonlyOnly<C>)
    : (AnyReadonly<C> extends false ? ObjOptionalOnly<C> : ObjMixed<C>);
declare function object<const C extends Record<string, unknown>>(c: CompTimeArgs<C>, id?: InjectRunTypeId<ObjectType<C>>): RunType<ObjectType<C>>;
declare function union<const T extends readonly RunType[]>(m: CompTimeArgs<T>, id?: InjectRunTypeId<UnionOf<T>>): RunType<UnionOf<T>>;
type UnionOf<T extends readonly RunType[]> = T extends readonly [infer H extends RunType, ...infer R extends readonly RunType[]] ? InferType<H> | UnionOf<R> : never;`,
};

// Object workloads — one per modifier profile + a wide 8-arm union.
const WORKLOADS = {
  'OBJECT.all_required': {
    expr: `object({ a: string(), b: number(), c: boolean(), d: string(), e: number(), child: object({ x: string(), y: number(), z: array(string()) }) })`,
    sample: `{ a:'', b:0, c:true, d:'', e:0, child:{ x:'', y:0, z:[''] } }`,
    expected: `{ a: string; b: number; c: boolean; d: string; e: number; child: { x: string; y: number; z: string[] } }`,
  },
  'OBJECT.optional_only': {
    expr: `object({ a: string(), b: number(), c: optional(boolean()), d: optional(string()), child: object({ x: string(), y: optional(number()) }) })`,
    sample: `{ a:'', b:0, child:{ x:'' } }`,
    expected: `{ a: string; b: number; c?: boolean; d?: string; child: { x: string; y?: number } }`,
  },
  'OBJECT.readonly_only': {
    expr: `object({ a: string(), b: ro(number()), c: ro(boolean()), d: string(), child: object({ x: ro(string()), y: number() }) })`,
    sample: `{ a:'', b:0, c:true, d:'', child:{ x:'', y:0 } }`,
    expected: `{ a: string; readonly b: number; readonly c: boolean; d: string; child: { readonly x: string; y: number } }`,
  },
  'OBJECT.mixed': {
    expr: `object({ a: string(), b: number(), d: optional(string()), e: ro(number()), f: optro(boolean()), child: object({ x: string(), y: optional(number()) }) })`,
    sample: `{ a:'', b:0, e:0, child:{ x:'' } }`,
    expected: `{ a: string; b: number; d?: string; readonly e: number; readonly f?: boolean; child: { x: string; y?: number } }`,
  },
};

// FORCE full resolution by a value assignment, THEN gate faithfulness: assert the
// recovered __T is mutually assignable with the hand-written Expected (both
// directions — a one-way check would miss widening OR narrowing).
function objProbe(form, w) {
  const force = `\nconst __x: __T = ${w.sample}; void __x;\ntype Exp = ${w.expected};\nconst __fwd: Exp = (null as any as __T);\nconst __bwd: __T = (null as any as Exp);\nvoid __fwd; void __bwd;`;
  return `${MACHINERY}\n${OBJECT_FORMS[form]}\nconst __s = ${w.expr};\ntype __T = InferType<typeof __s>;${force}`;
}
function baselineProbe(form) {
  return `${MACHINERY}\n${OBJECT_FORMS[form]}\nconst __s = string();\ntype __T = InferType<typeof __s>;\nlet __x!: __T; void __x;`;
}
function measureObject(form, w) {
  const base = compile(baselineProbe(form)).count;
  const full = compile(objProbe(form, w));
  return {
    n: Math.max(0, full.count - base),
    faithful: full.errors.length === 0,
    err: full.errors[0] && ts.flattenDiagnosticMessageText(full.errors[0].messageText, ' ').slice(0, 60),
  };
}

// ── report ───────────────────────────────────────────────────────────────────
const forms = Object.keys(OBJECT_FORMS);
const keys = Object.keys(WORKLOADS);
console.log('\nObjectType<C> — instantiations to resolve InferType<>, by modifier profile');
console.log('(✗ = recovered type ≠ expected; ratios vs `current`)\n');
console.log('workload'.padEnd(24) + forms.map((f) => f.padStart(16)).join(''));
console.log('-'.repeat(24 + 16 * forms.length));
const baseN = {};
for (const key of keys) {
  let line = key.padEnd(24);
  for (const form of forms) {
    const r = measureObject(form, WORKLOADS[key]);
    if (form === 'current') baseN[key] = r.n;
    const ratio = form !== 'current' && baseN[key] ? ` ${((r.n / baseN[key]) * 100).toFixed(0)}%` : '';
    const cell = `${r.n}${r.faithful ? '' : '✗'}${ratio}`;
    line += cell.padStart(16);
  }
  console.log(line);
}

// ── wide union: recursive UnionOf vs fixed-arity-8 overload ─────────────────────
const UNION_EXPR = `union([
  object({ kind: literal('a'), a: string() }), object({ kind: literal('b'), b: number() }),
  object({ kind: literal('c'), c: string() }), object({ kind: literal('d'), d: number() }),
  object({ kind: literal('e'), e: string() }), object({ kind: literal('f'), f: number() }),
  object({ kind: literal('g'), g: string() }), object({ kind: literal('h'), h: number() }),
] as const)`;
const UNION_SAMPLE = `{ kind: 'a', a: '' }`;
const UNION_EXP = `{kind:'a';a:string}|{kind:'b';b:number}|{kind:'c';c:string}|{kind:'d';d:number}|{kind:'e';e:string}|{kind:'f';f:number}|{kind:'g';g:string}|{kind:'h';h:number}`;
// object (current 4-way) WITHOUT a union decl, so each union form below controls the
// exact overload set + ORDER. Overloads resolve top-to-bottom: fixed-arity MUST come
// before the variadic recursive fallback (as in compose.ts) or it's never reached.
const OBJ_ONLY = `
type ObjectType<C> = ${OBJ_4WAY};
declare function object<const C extends Record<string, unknown>>(c: CompTimeArgs<C>, id?: InjectRunTypeId<ObjectType<C>>): RunType<ObjectType<C>>;`;
const UNION_RECURSIVE = `
type UnionOf<T extends readonly RunType[]> = T extends readonly [infer H extends RunType, ...infer R extends readonly RunType[]] ? InferType<H> | UnionOf<R> : never;
declare function union<const T extends readonly RunType[]>(m: CompTimeArgs<T>, id?: InjectRunTypeId<UnionOf<T>>): RunType<UnionOf<T>>;`;
const UNION_FIXED8 = `
type UnionOf<T extends readonly RunType[]> = T extends readonly [infer H extends RunType, ...infer R extends readonly RunType[]] ? InferType<H> | UnionOf<R> : never;
declare function union<A,B,C,D,E,F,G,H>(m: CompTimeArgs<readonly [RunType<A>,RunType<B>,RunType<C>,RunType<D>,RunType<E>,RunType<F>,RunType<G>,RunType<H>]>, id?: InjectRunTypeId<A|B|C|D|E|F|G|H>): RunType<A|B|C|D|E|F|G|H>;
declare function union<const T extends readonly RunType[]>(m: CompTimeArgs<T>, id?: InjectRunTypeId<UnionOf<T>>): RunType<UnionOf<T>>;`;
function measureUnion(unionDecls) {
  const decls = `${MACHINERY}\n${OBJ_ONLY}\n${unionDecls}`;
  const base = compile(`${decls}\nconst __s = string();\ntype __T = InferType<typeof __s>;\nlet __x!: __T; void __x;`).count;
  const full = compile(`${decls}\nconst __s = ${UNION_EXPR};\ntype __T = InferType<typeof __s>;\nconst __x: __T = ${UNION_SAMPLE}; void __x;\ntype Exp = ${UNION_EXP};\nconst __f: Exp = (null as any as __T); const __g: __T = (null as any as Exp); void __f; void __g;`);
  return {n: Math.max(0, full.count - base), faithful: full.errors.length === 0};
}
console.log('\nUNION (8 arms) — recursive UnionOf<T> vs fixed-arity-8 overload\n');
const ur = measureUnion(UNION_RECURSIVE);
const uf = measureUnion(UNION_FIXED8);
console.log(`  recursive (current)  ${String(ur.n).padStart(5)}  ${ur.faithful ? '✓' : '✗'}`);
console.log(`  fixed-arity-8        ${String(uf.n).padStart(5)}  ${uf.faithful ? '✓' : '✗'}   ${((uf.n / ur.n) * 100).toFixed(0)}% of current`);

// ── DIAGNOSTIC: the remaining tuple/simple-union floor (the NEXT target) ───────
// The ~700-instantiation floor on tuple()/union() (e.g. an EMPTY tuple still costs
// ~680) is NOT arity, overload count, the id marker, `const`, or MapTuple — it is
// `CompTimeArgs<T>` intersected with a TUPLE type. `T & {brand}` is cheap for an
// object (the `array` builder's `CompTimeArgs<RunType<T>>`) but expensive for a
// tuple. Stripping CompTimeArgs from a single-overload tuple cuts it ~91%.
const TUP_MACHINERY = `${MACHINERY}\ntype MapTuple<T extends readonly RunType[]> = {-readonly [K in keyof T]: InferType<T[K]>};`;
const TUP_FULL = `declare function tup<const T extends readonly RunType[]>(items: CompTimeArgs<T>, id?: InjectRunTypeId<MapTuple<T>>): RunType<MapTuple<T>>;`;
const TUP_NOCTA = `declare function tup<const T extends readonly RunType[]>(items: T, id?: InjectRunTypeId<MapTuple<T>>): RunType<MapTuple<T>>;`;
function measureTup(decl, expr, sample) {
  const base = compile(`${TUP_MACHINERY}\n${decl}\nconst __s = string();\ntype __T = InferType<typeof __s>;\nlet __x!: __T; void __x;`).count;
  const full = compile(`${TUP_MACHINERY}\n${decl}\nconst __s = ${expr};\ntype __T = InferType<typeof __s>;\nconst __x: __T = ${sample}; void __x;`);
  return Math.max(0, full.count - base);
}
console.log('\nTUPLE floor — root cause is CompTimeArgs<T> over a TUPLE type (next target)\n');
console.log(`  [string,number]  full(CompTimeArgs<T>): ${String(measureTup(TUP_FULL, `tup([string(), number()] as const)`, `['', 0]`)).padStart(4)}   drop CompTimeArgs: ${measureTup(TUP_NOCTA, `tup([string(), number()] as const)`, `['', 0]`)}`);
console.log(`  [] (empty tuple) full(CompTimeArgs<T>): ${String(measureTup(TUP_FULL, `tup([] as const)`, `[]`)).padStart(4)}   drop CompTimeArgs: ${measureTup(TUP_NOCTA, `tup([] as const)`, `[]`)}`);
console.log('');
