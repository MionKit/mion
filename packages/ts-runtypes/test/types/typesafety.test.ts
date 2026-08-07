// Type-safety regression tests for the marker package's public surface.
//
// The body of each `assertions...` function below is a type-only test.
// The functions are referenced (so esbuild does not tree-shake them) but
// never invoked, so the bodies have no runtime effect. Assertions are either
// positive (must compile) or `@ts-expect-error` directives that pin a
// type-level REJECTION — a regression that makes such a line compile again
// surfaces as TS2578 "Unused '@ts-expect-error' directive".
//
// Why this shape: vitest's typecheck mode is global (would surface a
// dozen unrelated preexisting type errors); we want focused regression
// tests for the builder/marker types. The IDE catches regressions
// immediately; CI catches them when anyone runs
// `tsc -p packages/ts-runtypes/tsconfig.test.json --noEmit`.

// NOTE: imports use RELATIVE `../src/…` paths (not the `ts-runtypes/*` package
// specifiers) so this file exercises the in-tree source directly. Import style
// no longer affects the vite plugin's transform scope (the gate is the
// resolver's site-file set — a scan result, not text matching), so the
// `getRunTypeId()` "no id injected" runtime-contract tests below call through a
// TYPE-ERASED alias instead: the scanner matches calls by their resolved marker
// signature, and an erased signature can never be rewritten. The assertion
// bodies are type-only / never invoked, so the value builders here never run.
import * as TF from '../../src/formats/index.ts';
import * as TFT from '../../src/formats/datetime/temporalFormats.ts';
import {describe, expect, test} from 'vitest';
import {getRunTypeId} from '../../src/index.ts';
import type {RunType, InferType} from '../../src/index.ts';
import * as RT from '../../src/builders/index.ts';

// Reference the assertion bodies from a real test so they don't get
// flagged as dead code by lint. The body is never invoked.
test('type-only assertions are referenced (no runtime work here)', () => {
  expect(typeof assertionsAcceptConcreteTypes).toBe('function');
  expect(typeof assertionsAcceptAny).toBe('function');
  expect(typeof assertionsAcceptUnknown).toBe('function');
  expect(typeof assertionsValueFirstDefine).toBe('function');
  expect(typeof assertionsExactParams).toBe('function');
  expect(typeof assertionsComposers).toBe('function');
  expect(typeof assertionsNewBuilders).toBe('function');
  expect(typeof assertionsComposerExactInference).toBe('function');
  expect(typeof assertionsFormatBranding).toBe('function');
  expect(typeof assertionsValueFirstBranding).toBe('function');
});

// Runtime contract: the markers throw at runtime when no id is injected
// (the vite plugin's job). Verifies the throw is reachable so consumers
// who forget to wire the plugin see a clear error instead of getting a
// useless empty-string id. The type-erased callee stands in for "no plugin
// wired": its resolved signature carries no marker param, so the scanner
// never injects these two calls whatever program they run in.
describe('runtime contract — markers throw without injected id', () => {
  const unInjectedGetRunTypeId = getRunTypeId as (...args: unknown[]) => string;

  test('getRunTypeId<T>() (static) throws when no id is provided', () => {
    expect(() => unInjectedGetRunTypeId()).toThrow(/getRunTypeId\(\): no id injected/);
  });

  test('getRunTypeId(value) (reflect) throws when no id is provided', () => {
    const value: string = 'hello';
    expect(() => unInjectedGetRunTypeId(value)).toThrow(/getRunTypeId\(\): no id injected/);
  });
});

function assertionsAcceptConcreteTypes(): void {
  // Concrete T: marker resolves normally. No directive — these should compile.
  // Static form puts the injected id at slot 1 (the value slot stays empty).
  const _stringId = getRunTypeId<string>(undefined, 'mock-id' as any);
  const _userId = getRunTypeId<{name: string}>(undefined, 'mock-id' as any);
  const _value: string = 'hello';
  const _inferredStringId = getRunTypeId(_value, 'mock-id' as any);
  const _user: {name: string} = {name: 'alice'};
  const _inferredUserId = getRunTypeId(_user, 'mock-id' as any);
  void _stringId;
  void _userId;
  void _inferredStringId;
  void _inferredUserId;
}

function assertionsAcceptAny(): void {
  // `any` is intentionally PERMITTED — there is no type-level guard. Explicit
  // `any` and value-inferred `any` (the common JSON.parse path) both resolve a
  // normal id; the runtime fn is a noop validator / best-effort serializer that
  // emits a build-time diagnostic. Both must compile WITHOUT a directive.
  const _explicitAnyId = getRunTypeId<any>(undefined, 'mock-id' as any);
  const anyValue: any = JSON.parse('{}');
  const _inferredAnyId = getRunTypeId(anyValue, 'mock-id' as any);
  void _explicitAnyId;
  void _inferredAnyId;
}

function assertionsAcceptUnknown(): void {
  // `unknown` is the opt-in escape hatch: unlike `any` it doesn't poison
  // downstream call sites — `unknown` values must be narrowed before
  // they're useful, so the failure mode surfaces at the consumer, not at
  // the marker. Should compile without a directive.
  const _unknownId = getRunTypeId<unknown>(undefined, 'mock-id' as any);
  void _unknownId;
}

function assertionsValueFirstDefine(): void {
  // Valid models compile — no directive. Each builder type-checks its own params,
  // and `RT.object(...)` assembles them. Property modifiers apply via the
  // `RT.optional(field)` shortcut or the general `RT.propMod({optional?,
  // readonly?}, field)`.
  const _ok = RT.object({
    name: TF.string({minLength: 1, maxLength: 50}),
    age: TF.number({min: 0, max: 120, integer: true}),
    born: TF.date({max: 'now'}),
    big: TF.bigInt({min: 0n, max: 1000n}),
    active: RT.boolean(),
    at: TFT.instant({max: 'now'}),
    day: RT.optional(TFT.plainDate()), // shortcut
    nick: RT.propMod({optional: true}, TF.string({maxLength: 8})), // general form
    slugRo: RT.propMod({readonly: true}, TF.string({maxLength: 8})), // readonly
  });
  void _ok;

  // Date sharing the number bounds is fine — `min`/`max`/`gt`/`lt` are valid
  // for the date param interface too.
  const _okDate = RT.object({born: TF.date({min: 'now', max: '2030-01-01T00:00:00'})});
  void _okDate;

  // A `pattern` is allowed on a string field as an inline `{source, flags?,
  // mockSamples?}` object or a `registerFormatPattern` result. mockSamples
  // are optional: a samples-less pattern gets its pool generated from the
  // regex at build time (a `StringParams.pattern`, same as the type-first
  // surface).
  const _okRegex = RT.object({
    slug: TF.string({pattern: {source: '^[a-z-]+$', flags: '', mockSamples: ['a-b']}}),
    digits: TF.string({pattern: {source: '^[0-9]+$', flags: '', mockSamples: ['123']}}),
    code: TF.string({pattern: {source: '^[a-z]{3}$', flags: ''}}),
  });
  void _okRegex;

  // An inline `{source, flags}` pattern without mockSamples is valid — the
  // build generates the samples.
  TF.string({pattern: {source: '^[0-9]+$', flags: ''}});

  // A bare `/regex/` VALUE stays rejected: `typeof /x/` is plain RegExp, so
  // no literal source/flags could ever reach the build-time scanner (the
  // exec?: never blocker on StringPatternArgs, load-bearing now that a
  // RegExp — which has source + flags — would otherwise fit structurally).
  // @ts-expect-error — a bare `/regex/` is not a valid pattern.
  TF.string({pattern: /^[a-z-]+$/});

  // Leaf builders return `RunType<FormatX<P>>` — the generic run-type carrying
  // the source type — NOT the bare brand.
  const _s: RunType<TF.String<{maxLength: 5}>> = TF.string({maxLength: 5});
  const _n: RunType<TF.Number<{min: 0}>> = TF.number({min: 0});
  const _b: RunType<boolean> = RT.boolean();
  void _s;
  void _n;
  void _b;

  // `InferType<…>` recovers the format type the RunType carries — both
  // directions compile only if it resolves EXACTLY to `TF.String<P>` (the
  // no-`infer` indexed-access round-trip).
  const _rtToFormat = (x: InferType<RunType<TF.String<{maxLength: 5}>>>): TF.String<{maxLength: 5}> => x;
  const _formatToRt = (x: TF.String<{maxLength: 5}>): InferType<RunType<TF.String<{maxLength: 5}>>> => x;
  void _rtToFormat;
  void _formatToRt;

  // @ts-expect-error — the result is a `RunType<…>`, NOT the bare format brand.
  const _notBareFormat: TF.String<{maxLength: 5}> = TF.string({maxLength: 5});
  void _notBareFormat;

  // A bare `optional(...)` / `propMod(...)` outside `object` is well-defined — it
  // yields the modifier carrier (which `object` unwraps). The carrier is NOT
  // itself a usable format brand, so it can't leak into a reflected position.
  const _carrier = RT.optional(TF.number({min: 0}));
  void _carrier;
  // @ts-expect-error — the modifier carrier is not assignable to the bare format.
  const _carrierLeak: TF.Number<{min: 0}> = RT.optional(TF.number({min: 0}));
  void _carrierLeak;

  // Cross-family param misuse is caught at the BUILDER CALL — each builder
  // types its own params arg, so the bad key errors locally (no exclusive-union
  // machinery needed). These replace the old inline-config leakage assertions.

  // @ts-expect-error — `maxLength` is a string param, not a number param.
  TF.number({maxLength: 5});

  // @ts-expect-error — `min` (number/date bound) is not a string param.
  TF.string({min: 0});

  // @ts-expect-error — `integer` (number-only) is not a date param.
  TF.date({integer: true});

  // @ts-expect-error — `boolean` takes no params at all.
  RT.boolean({maxLength: 5});

  // @ts-expect-error — `pattern` is a string-only param, not a number param.
  TF.number({pattern: /^[0-9]+$/});

  // @ts-expect-error — `bigint` bounds are bigint-valued; a number `5` (not
  // `5n`) errors on the value type.
  TF.bigInt({min: 5});

  // @ts-expect-error — a temporal builder's only params are min/max/gt/lt; a
  // string param (`maxLength`) is rejected.
  TFT.instant({maxLength: 5});
}

// Exact-params regression — each format / TypeFormat builder must reject a param
// key that isn't in its family's params interface, EVEN when a valid key is also
// present. A bare `<const P extends XParams>` constraint does NOT catch this: an
// object literal with one valid + one excess key satisfies the constraint
// structurally, so excess-property checking never fires and the typo silently
// widens the accepted params. `ExactParams<P, XParams>` (folded inside the
// `CompTimeArgs<…>` type arg, builderTypes.ts) closes the hole by resolving every
// excess key to `never`. Strong param typing is a core reason to author with
// schemas instead of hand-written types, so these guard against a regression that
// would quietly re-open the gap. Each `@ts-expect-error` pins a rejection; a
// regression that makes the line compile surfaces as TS2578 "unused directive".
function assertionsExactParams(): void {
  // Valid params (single OR multiple valid keys) still compile — no directive.
  const _okNum = TF.number({min: 0, max: 100, lt: 50, integer: true});
  const _okStr = TF.string({minLength: 1, maxLength: 50, trim: true});
  const _okBig = TF.bigInt({min: 0n, max: 1000n});
  const _okDate = TF.date({min: 'now', max: '2030-01-01T00:00:00'});
  const _okTemporal = TFT.instant({min: 'now', max: 'now'});
  const _okAlpha = TF.alpha({maxLength: 3});
  void _okNum;
  void _okStr;
  void _okBig;
  void _okDate;
  void _okTemporal;
  void _okAlpha;

  // A single misspelled key (all keys unknown) is caught by plain excess-property
  // checking — the constraint's baseline. Kept so a change that loses even this
  // weaker guard is visible.
  // @ts-expect-error — `minn` is a typo for `min`; no such number param.
  TF.number({minn: 0});

  // The REGRESSION-CRITICAL cases: an excess / misspelled key alongside a VALID
  // key. Without `ExactParams` these compiled (the excess key was silently
  // swallowed and its constraint dropped). Each must now error.

  // @ts-expect-error — `mn` (typo for `max`) is not a number param, even with a valid `min`.
  TF.number({min: 0, mn: 100});
  // @ts-expect-error — `bogus` is not a number param.
  TF.number({lt: 100, bogus: 5});
  // @ts-expect-error — `maxLenght` (typo) is not a string param, even with a valid `minLength`.
  TF.string({minLength: 1, maxLenght: 50});
  // @ts-expect-error — `trimm` (typo for `trim`) is not a string param.
  TF.string({maxLength: 5, trimm: true});
  // @ts-expect-error — `mx` (typo for `max`) is not a bigint param.
  TF.bigInt({min: 0n, mx: 10n});
  // @ts-expect-error — `maxx` (typo) is not a date param.
  TF.date({min: 'now', maxx: 'now'});
  // @ts-expect-error — `gtt` (typo for `gt`) is not a temporal param.
  TFT.instant({min: 'now', gtt: 'now'});
  // @ts-expect-error — `maxLenght` (typo) is not a valid `alpha` string param.
  TF.alpha({minLength: 1, maxLenght: 3});

  // A branded call (params + `brand(...)`) keeps the same exactness — the excess
  // key errors even in the two-arg overload.
  // @ts-expect-error — `bogus` is not a number param (branded overload).
  TF.number({min: 0, bogus: 1}, TF.brand('Age'));

  // `propMod`'s modifier bag is exact too — a misspelled modifier no longer slips
  // through and silently fails to apply.
  // @ts-expect-error — `optionl` is a typo for `optional`; not a valid modifier.
  RT.propMod({optionl: true}, TF.string({maxLength: 8}));
}

function assertionsComposers(): void {
  // Composer builders return `RunType<…>` for the COMPOSED type — these
  // positive assignments compile only if the carried type is exactly right
  // (no `infer`: `MapTuple` over the child tuple, `[number]` for unions,
  // positional `A & B` for intersections).
  const _arr: RunType<boolean[]> = RT.array(RT.boolean());
  const _tup: RunType<[boolean, boolean]> = RT.tuple([RT.boolean(), RT.boolean()]);
  const _tupRest: RunType<[boolean, ...boolean[]]> = RT.tuple([RT.boolean()], RT.boolean());
  const _uni: RunType<boolean | 'x'> = RT.union([RT.boolean(), RT.literal('x')]);
  const _int: RunType<{a: boolean} & {b: boolean}> = RT.intersection(RT.object({a: RT.boolean()}), RT.object({b: RT.boolean()}));
  const _rec: RunType<Record<string, boolean>> = RT.record(RT.boolean());
  const _obj: RunType<{a: boolean}> = RT.object({a: RT.boolean()});
  void _arr;
  void _tup;
  void _tupRest;
  void _uni;
  void _int;
  void _rec;
  void _obj;

  // Leaf builders: `literal` narrows via `const` to the literal type; `regexp` /
  // `symbol` are fixed.
  const _litStr: RunType<'a'> = RT.literal('a');
  const _litTrue: RunType<true> = RT.literal(true);
  const _litNum: RunType<42> = RT.literal(42);
  const _litNull: RunType<null> = RT.literal(null);
  const _re: RunType<RegExp> = RT.regexp();
  const _sym: RunType<symbol> = RT.symbol();
  void _litStr;
  void _litTrue;
  void _litNum;
  void _litNull;
  void _re;
  void _sym;

  // `InferType<…>` round-trips a composed type back to its tuple form.
  const _back = (x: InferType<RunType<[boolean, number]>>): [boolean, number] => x;
  void _back;

  // @ts-expect-error — `array` takes a RunType schema, not the bare builder fn.
  RT.array(RT.boolean);

  // @ts-expect-error — `literal` only accepts string/number/bigint/boolean/null/undefined.
  RT.literal({});

  // @ts-expect-error — the result is a `RunType<…>`, NOT the bare composed type.
  const _notBare: boolean[] = RT.array(RT.boolean());
  void _notBare;
}

function assertionsNewBuilders(): void {
  // Top / bottom atomic builders carry exactly their kind.
  const _any: RunType<any> = RT.any();
  const _unk: RunType<unknown> = RT.unknown();
  const _nev: RunType<never> = RT.never();
  const _voi: RunType<void> = RT.void();
  void _any;
  void _unk;
  void _nev;
  void _voi;

  // 3-arg tuple: the SECOND array is the trailing OPTIONAL elements
  // (`Partial<MapTuple<O>>` → each `?`); a third RunType is the rest element.
  const _tupOpt: RunType<[number, bigint?, boolean?]> = RT.tuple([TF.number()], [TF.bigInt(), RT.boolean()]);
  const _tupOptRest: RunType<[number, bigint?, ...string[]]> = RT.tuple([TF.number()], [TF.bigInt()], TF.string());
  void _tupOpt;
  void _tupOptRest;

  // func(): ret defaults to void. The wired cases use no typed params (function
  // values lower per position); `func([], any())` is the `() => any` form that
  // tuple_with_non_serializable and interface_with_method author. (A typed-param
  // func carries each leaf's format brand on its param — fine for the scanner,
  // but not asserted as plain primitives here.)
  const _fn0: RunType<() => void> = RT.func();
  const _fnAny: RunType<() => any> = RT.func([], RT.any());
  void _fn0;
  void _fnAny;

  // classType(C): recovers the class's nominal instance type off the ctor.
  class _Point {
    x = 0;
    y = 0;
  }
  const _cls: RunType<_Point> = RT.classType(_Point);
  void _cls;

  // classType generic pin: the single-param form infers for non-generic classes
  // (above) and pins a generic class's instantiation via an explicit Instance arg.
  class _Box<T> {
    contents!: T;
  }
  const _boxNum: RunType<_Box<number>> = RT.classType<_Box<number>>(_Box);
  void _boxNum;

  // func tuple-overload: params as a single tuple RunType (so optional/rest params
  // ride tuple()); `(...args: T)` ≡ the spread tuple. Brand-free booleans so the
  // positive assignment matches exactly.
  const _fnTup: RunType<(a: boolean, b?: boolean) => void> = RT.func(RT.tuple([RT.boolean()], [RT.boolean()]));
  void _fnTup;

  // parameters(fn): extracts the function's parameter tuple — fixed, trailing-
  // optional, and rest forms each converge with `Parameters<F>`.
  const _pFixed: RunType<[boolean, boolean]> = RT.parameters(RT.func([RT.boolean(), RT.boolean()]));
  const _pOpt: RunType<[boolean, boolean?]> = RT.parameters(RT.func(RT.tuple([RT.boolean()], [RT.boolean()])));
  const _pRest: RunType<[boolean, ...boolean[]]> = RT.parameters(RT.func(RT.tuple([RT.boolean()], RT.boolean())));
  void _pFixed;
  void _pOpt;
  void _pRest;

  // utility-type builders: each brand is the RESOLVED stdlib utility type. Brand-
  // free booleans/literals so the positive assignment matches exactly.
  const _uModel = RT.object({a: RT.boolean(), b: RT.boolean()});
  const _uPartial: RunType<Partial<{a: boolean; b: boolean}>> = RT.partial(_uModel);
  const _uRequired: RunType<Required<{a?: boolean; b?: boolean}>> = RT.required(
    RT.object({a: RT.optional(RT.boolean()), b: RT.optional(RT.boolean())})
  );
  const _uPick: RunType<Pick<{a: boolean; b: boolean}, 'a'>> = RT.pick(_uModel, ['a']);
  const _uOmit: RunType<Omit<{a: boolean; b: boolean}, 'a'>> = RT.omit(_uModel, ['a']);
  const _uExclude: RunType<'x'> = RT.exclude(RT.union([RT.literal('x'), RT.literal('y')]), RT.literal('y'));
  const _uExtract: RunType<'x'> = RT.extract(RT.union([RT.literal('x'), RT.literal('y')]), RT.literal('x'));
  const _uNonNull: RunType<boolean> = RT.nonNullable(RT.union([RT.boolean(), RT.literal(null)]));
  const _uReadonly: RunType<Readonly<{a: boolean}>> = RT.readonly(RT.object({a: RT.boolean()}));
  const _uReturn: RunType<boolean> = RT.returnType(RT.func([TF.number()], RT.boolean()));
  void _uModel;
  void _uPartial;
  void _uRequired;
  void _uPick;
  void _uOmit;
  void _uExclude;
  void _uExtract;
  void _uNonNull;
  void _uReadonly;
  void _uReturn;

  // record(key, value): the key schema's type becomes the index-signature key. A
  // templateLiteral key is unbranded, so it stays the `api/${string}` pattern.
  const _recTpl: RunType<Record<`api/${string}`, boolean>> = RT.record(RT.templateLiteral(['api/', TF.string()]), RT.boolean());
  void _recTpl;

  // templateLiteral: produces a REAL template-literal type that must converge
  // with the PLAIN type-first `${number}`. The UNANNOTATED builder type is
  // checked BOTH directions — the reverse (plain `number` → builder type) is the
  // regression guard for the format-brand leak (`Unbrand`): a branded placeholder
  // would reject plain `number` and fail here. A positive annotated assignment
  // alone would NOT catch it (branded ⊆ plain).
  const _tplBuilt = RT.templateLiteral(['api/user/', TF.number()]);
  const _tplFwd = (x: InferType<typeof _tplBuilt>): `api/user/${number}` => x;
  const _tplRev = (x: `api/user/${number}`): InferType<typeof _tplBuilt> => x;
  void _tplBuilt;
  void _tplFwd;
  void _tplRev;

  // Union + literal placeholders distribute exactly like the type-first form.
  const _tplUni: RunType<`${'a' | 'b'}-${number}`> = RT.templateLiteral([
    RT.union([RT.literal('a'), RT.literal('b')]),
    '-',
    TF.number(),
  ]);
  void _tplUni;
}

function assertionsFormatBranding(): void {
  // Formats are TRANSPARENT by default — an UNbranded `TF.String<P>` stays
  // mutually assignable with its base `string` (the sentinels are optional on
  // TypeFormat). This is the property that lets a plain value flow into a
  // format-typed slot — and a reflected value drive `T` inference — with NO
  // cast. Both directions must compile WITHOUT a directive; a regression to the
  // old required-prop (always-branded) shape makes the first line fail.
  const _strIntoFormat: TF.String<{maxLength: 5}> = 'hello';
  const _formatIntoStr: string = _strIntoFormat;
  const _numIntoFormat: TF.Number<{min: 0}> = 42;
  void _strIntoFormat;
  void _formatIntoStr;
  void _numIntoFormat;

  // Passing a brand NAME opts INTO a nominal type: a bare primitive no longer
  // satisfies it (the REQUIRED `__rtFormatBrand` marker is missing), so the
  // compiler forces the value through a validation/cast boundary.
  // @ts-expect-error — a plain string is not assignable to a BRAND-NAMED format.
  const _branded: TF.String<{maxLength: 5}, 'UserCode'> = 'hello';
  void _branded;

  // A branded value still flows OUT to the unbranded format and to its base —
  // the brand is a refinement, not an incompatible type.
  const _brandedFlowsOut = (branded: TF.String<{maxLength: 5}, 'UserCode'>): void => {
    const _toUnbranded: TF.String<{maxLength: 5}> = branded;
    const _toBase: string = branded;
    void _toUnbranded;
    void _toBase;
  };
  void _brandedFlowsOut;

  // The SAME default-transparent / brand-nominal rule holds for the other base
  // formats. `TF.Date` is the explicit regression guard: it previously
  // hardcoded a `'nativeDate'` BrandName arg (dead while TypeFormat ignored
  // BrandName) that, once BrandName was honored, made every `TF.Date<P>`
  // spuriously nominal and split it from the transparent value-first `date()`
  // builder. A plain `Date` / `bigint` must flow into the UNbranded form…
  const _dateIntoFormat: TF.Date<{max: 'now'}> = new Date();
  const _formatIntoDate: Date = _dateIntoFormat;
  const _bigIntoFormat: TF.BigInt<{min: 0n}> = 0n;
  void _dateIntoFormat;
  void _formatIntoDate;
  void _bigIntoFormat;
  // …and be REJECTED by the brand-named (nominal) form.
  // @ts-expect-error — a plain Date is not assignable to a BRAND-NAMED date format.
  const _brandedDate: TF.Date<{max: 'now'}, 'CreatedAt'> = new Date();
  // @ts-expect-error — a plain bigint is not assignable to a BRAND-NAMED bigint format.
  const _brandedBig: TF.BigInt<{min: 0n}, 'Balance'> = 0n;
  void _brandedDate;
  void _brandedBig;
}

// Exact (invariant) type equality — `(<T>() => T extends A ? 1 : 2)` paired both
// ways is the standard trick: it holds ONLY when A and B are mutually identical,
// not merely assignable.
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertExact<A, B>(_ok: Exact<A, B>): void {
  void _ok;
}

function assertionsComposerExactInference(): void {
  // EXACT-type guards for the CompTimeArgs-branded composers. The positive
  // ASSIGNMENT checks in assertionsComposers/assertionsNewBuilders are necessary
  // but NOT sufficient for the variadic builders: function-parameter
  // contravariance lets a WIDENED `(...args: (string | number)[]) => R` pass as
  // `(a: string, b: number) => R`, and a widened tuple can slip through some
  // positions too. These pin the exact carried type, so a regression in the
  // `const T` / `const P` capture or in `MapTuple`'s `-readonly` — the
  // combination that keeps precise per-slot inference once the param is wrapped
  // in the `CompTimeArgs` brand intersection — fails HERE loudly instead of
  // silently degrading the structural id the scanner reads off the brand.
  const _tup = RT.tuple([RT.boolean(), TF.number()]);
  assertExact<InferType<typeof _tup>, [boolean, number]>(true);

  const _tupOpt = RT.tuple([TF.number()], [RT.boolean()]);
  assertExact<InferType<typeof _tupOpt>, [number, boolean?]>(true);

  const _tupRest = RT.tuple([TF.number()], TF.string());
  assertExact<InferType<typeof _tupRest>, [number, ...string[]]>(true);

  // func array-overload: the contravariance trap lives here — only an exact
  // check catches a widened param tuple.
  const _fn = RT.func([TF.string(), TF.number()], RT.boolean());
  assertExact<InferType<typeof _fn>, (a: string, b: number) => boolean>(true);

  const _fn0 = RT.func();
  assertExact<InferType<typeof _fn0>, () => void>(true);

  // union keeps its spread `[...T]` (the `[number]` index flattens, so the brand
  // can't widen the member union) — pinned exact to lock that in.
  const _uni = RT.union([RT.boolean(), RT.literal('x')]);
  assertExact<InferType<typeof _uni>, boolean | 'x'>(true);

  // array: the simple-generic shape stays exact under the brand.
  const _arr = RT.array(RT.boolean());
  assertExact<InferType<typeof _arr>, boolean[]>(true);

  // Spread composition — split a shared fragment into a `const` and merge it at
  // the call site. TypeScript performs the type-level merge, so the builder
  // reflects the merged type for free; the Go scanner accepts the spread of a
  // `const`-bound literal fragment (CompTimeArgs). Pinned exact so a regression
  // in the merged inference fails here.
  const _baseFields = {id: TF.number(), name: TF.string()};
  const _objSpread = RT.object({..._baseFields, active: RT.boolean()});
  assertExact<InferType<typeof _objSpread>, {id: number; name: string; active: boolean}>(true);

  // tuple / union spread: the operand must be a TUPLE (`as const` / const-
  // inferred) — spreading a tuple preserves per-slot precision, whereas
  // spreading a plain `RunType[]` would collapse to an array and lose it. These
  // pin the tuple-operand path that keeps the exact per-slot / per-member types.
  const _tupleParts = [TF.number(), RT.boolean()] as const;
  const _tupSpread = RT.tuple([..._tupleParts, TF.string()]);
  assertExact<InferType<typeof _tupSpread>, [number, boolean, string]>(true);

  const _unionParts = [TF.string(), TF.number()] as const;
  const _uniSpread = RT.union([..._unionParts, RT.boolean()]);
  assertExact<InferType<typeof _uniSpread>, string | number | boolean>(true);
}

// Value-first leaf branding — the `string` / `number` / `bigint` / `date`
// builders carry the SAME default-transparent / brand-nominal semantics as the
// type-first `Format*` aliases. `brand(name)` is the opt-in: without it the leaf
// is transparent; with it the leaf is the nominal `Format*<P, B>`.
//
// Asserted by assignability (+ `@ts-expect-error` for the nominal rejections)
// rather than `assertExact`: the `const P` capture adds a `readonly` modifier to
// the params, so the value-first `InferType<…>` differs from the type-first alias by
// `readonly` only — id-irrelevant (the scanner canonicalises params), but enough
// to fail exact equality. Mutual assignability is `readonly`-tolerant and still
// proves the two authoring paths converge on one interchangeable type; the
// `@ts-expect-error` lines independently prove the brand is actually applied (a
// missing brand would make them assignable → an "unused directive" failure).
function assertionsValueFirstBranding(): void {
  // DEFAULT (no brand tag) → TRANSPARENT: base value flows in AND out, and the
  // leaf is mutually assignable with the UNbranded type-first alias (convergence).
  const codeStr = TF.string({minLength: 1});
  const _strIn: InferType<typeof codeStr> = 'hello';
  const _strOut: string = _strIn;
  const _vfToTypeFirst: TF.String<{minLength: 1}> = _strIn; // value-first → type-first
  const _typeFirstToVf: InferType<typeof codeStr> = _vfToTypeFirst; // type-first → value-first
  void _strIn;
  void _strOut;
  void _vfToTypeFirst;
  void _typeFirstToVf;

  const createdAt = TF.date({max: 'now'});
  const _dateIn: InferType<typeof createdAt> = new Date(); // transparent: plain Date flows in
  const _dateVfToTf: TF.Date<{max: 'now'}> = _dateIn;
  const numLeaf = TF.number({min: 0});
  const bigLeaf = TF.bigInt({min: 0n});
  const _numIn: InferType<typeof numLeaf> = 42; // number leaf transparent
  const _bigIn: InferType<typeof bigLeaf> = 0n; // bigint leaf transparent
  void _dateIn;
  void _dateVfToTf;
  void _numIn;
  void _bigIn;

  // BRANDED (brand tag) → NOMINAL: a bare base value no longer satisfies it (the
  // REQUIRED `__rtFormatBrand` marker is missing). One `@ts-expect-error` per base
  // builder proves the tag actually brands the carried type. (Builders bound to a
  // const first — `typeof` type queries reject inline call expressions.)
  const userId = TF.string({minLength: 1}, TF.brand('UserId'));
  const ageBrand = TF.number({min: 0}, TF.brand('Age'));
  const balanceBrand = TF.bigInt({min: 0n}, TF.brand('Balance'));
  const createdBrand = TF.date({max: 'now'}, TF.brand('CreatedAt'));
  // @ts-expect-error — nominal: a plain string is not assignable to a branded string leaf.
  const _brandedStr: InferType<typeof userId> = 'hello';
  // @ts-expect-error — nominal: a plain number is not assignable to a branded number leaf.
  const _brandedNum: InferType<typeof ageBrand> = 42;
  // @ts-expect-error — nominal: a plain bigint is not assignable to a branded bigint leaf.
  const _brandedBig: InferType<typeof balanceBrand> = 0n;
  // @ts-expect-error — nominal: a plain Date is not assignable to a branded date leaf.
  const _brandedDate: InferType<typeof createdBrand> = new Date();
  void _brandedStr;
  void _brandedNum;
  void _brandedBig;
  void _brandedDate;

  // The branded leaf converges with the type-first `Format*<P, 'UserId'>` (mutually
  // assignable) and still flows OUT to the unbranded form + base (brand = refinement).
  const _brandFlows = (b: InferType<typeof userId>): void => {
    const _toTypeFirstBranded: TF.String<{minLength: 1}, 'UserId'> = b;
    const _backToVf: InferType<typeof userId> = _toTypeFirstBranded;
    const _toUnbranded: TF.String<{minLength: 1}> = b;
    const _toBase: string = b;
    void _toTypeFirstBranded;
    void _backToVf;
    void _toUnbranded;
    void _toBase;
  };
  void _brandFlows;
}
