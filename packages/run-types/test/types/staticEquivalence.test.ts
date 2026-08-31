// Compile-time proof that `InferType<typeof schema>` recovers EXACTLY the TS type a
// value-first schema models — across the whole builder surface. Each case binds a
// schema to a `const`, then asserts `InferType<typeof schema>` is mutually assignable
// (both directions) with the hand-written type-first equivalent. This is the
// type-level twin of the runtime convergence suite (test/suites/id-integrity/).
//
// `assertMutual<S, T>()` is the helper form of the cross-assignment:
//     const _a: S = (x as T);   // T → S
//     const _b: T = (x as S);   // S → T
// It compiles ONLY when S and T are mutually assignable; otherwise the no-arg call
// errors (the rest param becomes a required `[error: …]` tuple). Tuple-wrapping
// (`[S] extends [T]`) stops unions from distributing so `string | number` compares
// as a whole.
//
// WHY this passes: `InferType<RT>` is just `NonNullable<RT['__rtType']>['t']` — a
// getter. The resolution (config → modeled type) is done EAGERLY by each builder's
// return type (`ObjectType<C>`, `MapTuple<T>`, `LeafType<…>`, …) and stored in the
// phantom `__rtType`; `InferType` reads it back. Drop those helpers and the SAME
// `InferType` yields e.g. `{a: RunType<string>}` instead of `{a: string}`.
//
// The bodies are type-only and never invoked; the `test` references them so lint
// doesn't flag them. The real check is tsc:
//   pnpm exec tsc --noEmit -p packages/run-types/tsconfig.test.json

import * as TF from '@mionjs/run-types/formats';
import {expect, test} from 'vitest';
import * as RT from '@mionjs/run-types/builders';
import type {InferType} from '@mionjs/run-types';

/** Asserts `S` and `T` are mutually assignable (the helper form of cross-assigning
 *  a value of each type to the other). No-arg call compiles iff equivalent. */
function assertMutual<S, T>(
  ..._proof: [S] extends [T]
    ? [T] extends [S]
      ? []
      : [error: 'T not assignable to S', T, S]
    : [error: 'S not assignable to T', S, T]
): void {
  void _proof;
}

/** A STRICTER equality than `assertMutual` — it catches the difference
 *  `assertMutual` cannot: whether `S` is a single object literal or a group
 *  INTERSECTION. `object({a, optional b})` must recover `{a: string; b?: number}`,
 *  not `{a: string} & {b?: number}` (the two are mutually assignable, so
 *  `assertMutual` passes for both — but the intersection is what used to leak into
 *  `InferType<typeof schema>`). `Flat<T> = {[K in keyof T]: T[K]}` collapses one
 *  level of a would-be intersection; the invariant `Eq` then diverges whenever a
 *  nested member is still an intersection (single-level `Flat` can't reach it), so
 *  a nested optional/readonly object that wasn't flattened fails here. It is also
 *  readonly-sensitive (plain assignability treats readonly/mutable as equal). */
type Flat<T> = {[K in keyof T]: T[K]};
type Eq<A, B> = (<G>() => G extends Flat<A> ? 1 : 2) extends <G>() => G extends Flat<B> ? 1 : 2 ? true : false;
function assertExact<S, T>(
  ..._proof: Eq<S, T> extends true ? [] : [error: 'S is not the exact (un-intersected) shape of T', S, T]
): void {
  void _proof;
}

test('InferType ⇄ type-first equivalence assertions are referenced (compile-time check)', () => {
  expect(typeof atomicLeaves).toBe('function');
  expect(typeof brandedLeaves).toBe('function');
  expect(typeof composers).toBe('function');
  expect(typeof objects).toBe('function');
  expect(typeof utilities).toBe('function');
});

// ── Atomic leaves (no params → plain base type) ──────────────────────
function atomicLeaves(): void {
  const str = TF.string();
  const num = TF.number();
  const bool = RT.boolean();
  const big = TF.bigInt();
  const dat = TF.date();
  const re = RT.regexp();
  const litS = RT.literal('a');
  const litN = RT.literal(42);
  const litB = RT.literal(true);
  const litNull = RT.literal(null);
  const litUndef = RT.literal(undefined);
  assertMutual<InferType<typeof str>, string>();
  assertMutual<InferType<typeof num>, number>();
  assertMutual<InferType<typeof bool>, boolean>();
  assertMutual<InferType<typeof big>, bigint>();
  assertMutual<InferType<typeof dat>, Date>();
  assertMutual<InferType<typeof re>, RegExp>();
  assertMutual<InferType<typeof litS>, 'a'>();
  assertMutual<InferType<typeof litN>, 42>();
  assertMutual<InferType<typeof litB>, true>();
  assertMutual<InferType<typeof litNull>, null>();
  assertMutual<InferType<typeof litUndef>, undefined>();
}

// ── Leaves with params (→ branded format type) ───────────────────────
function brandedLeaves(): void {
  const str = TF.string({maxLength: 5});
  const num = TF.number({min: 0, max: 9});
  assertMutual<InferType<typeof str>, TF.String<{maxLength: 5}>>();
  assertMutual<InferType<typeof num>, TF.Number<{min: 0; max: 9}>>();
}

// ── Composers ────────────────────────────────────────────────────────
function composers(): void {
  const arr = RT.array(TF.string());
  const arrObj = RT.array(RT.object({a: TF.number()}));
  const tup = RT.tuple({required: [TF.string(), TF.number()]});
  const tupOpt = RT.tuple({required: [TF.string()], optional: [TF.number()]});
  const tupRest = RT.tuple({required: [TF.string()], rest: TF.number()});
  const uni = RT.union([TF.string(), TF.number()]);
  const uniLit = RT.union([RT.literal('a'), RT.literal('b')]);
  const inter = RT.intersection(RT.object({a: TF.string()}), RT.object({b: TF.number()}));
  const rec = RT.record(TF.number());
  const recKV = RT.record(TF.string(), RT.boolean());
  const mp = RT.map(TF.string(), TF.number());
  const st = RT.set(TF.string());
  const prom = RT.promise(TF.string());
  const fn = RT.func({params: [TF.string(), TF.number()], ret: RT.boolean()});
  const tmpl = RT.templateLiteral(['user/', TF.number()]);
  assertMutual<InferType<typeof arr>, string[]>();
  assertMutual<InferType<typeof arrObj>, {a: number}[]>();
  assertMutual<InferType<typeof tup>, [string, number]>();
  assertMutual<InferType<typeof tupOpt>, [string, number?]>();
  assertMutual<InferType<typeof tupRest>, [string, ...number[]]>();
  assertMutual<InferType<typeof uni>, string | number>();
  assertMutual<InferType<typeof uniLit>, 'a' | 'b'>();
  assertMutual<InferType<typeof inter>, {a: string} & {b: number}>();
  assertMutual<InferType<typeof rec>, Record<string, number>>();
  assertMutual<InferType<typeof recKV>, Record<string, boolean>>();
  assertMutual<InferType<typeof mp>, Map<string, number>>();
  assertMutual<InferType<typeof st>, Set<string>>();
  assertMutual<InferType<typeof prom>, Promise<string>>();
  assertMutual<InferType<typeof fn>, (a: string, b: number) => boolean>();
  assertMutual<InferType<typeof tmpl>, `user/${number}`>();
}

// ── object() + property modifiers ────────────────────────────────────
function objects(): void {
  // The request's headline example.
  const obj = RT.object({a: TF.string(), b: RT.optional(TF.number())});
  const nested = RT.object({id: TF.number(), tags: RT.array(TF.string()), meta: RT.object({ok: RT.boolean()})});
  // readonly modifier (note: TS treats readonly/mutable as mutually assignable, so
  // this asserts the shape, not the readonly bit itself).
  const ro = RT.object({a: RT.propMod({readonly: true}, TF.string())});
  assertMutual<InferType<typeof obj>, {a: string; b?: number}>();
  assertMutual<InferType<typeof nested>, {id: number; tags: string[]; meta: {ok: boolean}}>();
  assertMutual<InferType<typeof ro>, {readonly a: string}>();

  // Stricter than the assignability checks above: `InferType` of a modified-field
  // object must be a SINGLE object literal, not a `{required} & {optional}` group
  // intersection. `assertExact` fails on the intersection (which `assertMutual`
  // accepts), so these pin that `object({a, optional b})` recovers a plain
  // `{a: string; b?: number}` — at every nesting level.
  const nestedOpt = RT.object({
    a: TF.string(),
    b: RT.optional(TF.number()),
    child: RT.object({x: TF.string(), y: RT.optional(RT.boolean())}),
  });
  const roMixed = RT.object({
    a: TF.string(),
    b: RT.propMod({readonly: true}, TF.number()),
    c: RT.propMod({optional: true, readonly: true}, TF.string()),
  });
  assertExact<InferType<typeof obj>, {a: string; b?: number}>();
  assertExact<InferType<typeof ro>, {readonly a: string}>();
  assertExact<InferType<typeof nestedOpt>, {a: string; b?: number; child: {x: string; y?: boolean}}>();
  assertExact<InferType<typeof roMixed>, {a: string; readonly b: number; readonly c?: string}>();
}

// ── Utility-type builders ────────────────────────────────────────────
function utilities(): void {
  const par = RT.partial(RT.object({a: TF.string(), b: TF.number()}));
  const req = RT.required(RT.object({a: TF.string(), b: RT.optional(TF.number())}));
  const pck = RT.pick(RT.object({a: TF.string(), b: TF.number()}), ['a']);
  const omt = RT.omit(RT.object({a: TF.string(), b: TF.number()}), ['b']);
  const nn = RT.nonNullable(RT.union([TF.string(), RT.literal(null), RT.literal(undefined)]));
  const roT = RT.readonlyType(RT.object({a: TF.string()}));
  const ret = RT.returnType(RT.func({ret: TF.number()}));
  const params = RT.parameters(RT.func({params: [TF.string(), TF.number()], ret: RT.boolean()}));
  assertMutual<InferType<typeof par>, {a?: string; b?: number}>();
  assertMutual<InferType<typeof req>, {a: string; b: number}>();
  assertMutual<InferType<typeof pck>, {a: string}>();
  assertMutual<InferType<typeof omt>, {a: string}>();
  assertMutual<InferType<typeof nn>, string>();
  assertMutual<InferType<typeof roT>, {readonly a: string}>();
  assertMutual<InferType<typeof ret>, number>();
  assertMutual<InferType<typeof params>, [string, number]>();
}
