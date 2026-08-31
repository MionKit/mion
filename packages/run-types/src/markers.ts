// Marker primitives — the type-level brands the Go binary scanner recognizes
// at call sites:
//   • `InjectRunTypeId<T>` — the only *injectable* marker. The trailing
//     `id?: InjectRunTypeId<T>` parameter is filled in at build time by
//     `ts-runtypes-devtools` with an opaque reflection handle for `T`.
//   • `CompTimeArgs<T>` — brands an argument as "must be a literal at the
//     call site, or a module-scope `const` whose initializer is itself
//     entirely literal". Static check only, no injection.
//   • `PureFunction<F>` — brands a function-typed argument as "literal AND
//     passes purity rules". Static check only.
//
// Wrappers around `getRunTypeId` / `getRunType` are supported — declare the same
// trailing `id?: InjectRunTypeId<T>` parameter on the wrapper and the transformer
// injects at its call sites identically. Inside the wrapper body resolve the
// handle by FORWARDING it to a public resolver as the trailing argument
// (`getRunType<T>(undefined, id)` / `getRunTypeId<T>(undefined, id)`); such a
// forwarded call is a pass-through the build leaves untouched. Do NOT hand the
// handle to the low-level `getRTUtils().getRunType()` — that takes a string id
// and returns undefined for the injected handle.

import {entryTupleKey, initFromTuple, isEntryTuple} from './runtypes/entryTuple.ts';
import type {RunType} from './runtypes/types.ts';

/**
 * Sentinel marker. `T` is a phantom type parameter used only by the checker /
 * transformer. The declared type is a branded `string` so a wrapper's
 * `id?: InjectRunTypeId<T>` parameter reads as a string and the brand keeps
 * stringly-typed APIs from accidentally satisfying the marker. At RUNTIME the
 * build injects an OPAQUE handle (an entry-module tuple that also carries `T`'s
 * type graph for lazy registration), NOT a bare hash string — resolve it by
 * forwarding it to `getRunType` / `getRunTypeId` (see the wrapper note above),
 * never by indexing `getRTUtils().getRunType()` with it directly.
 */
export type InjectRunTypeId<T> = string & {
  readonly __rtInjectRunTypeIdBrand?: T;
};

/**
 * Trailing-slot injection marker for the `createX` factories. Like
 * `InjectRunTypeId<T>` the transformer fills the `id?` parameter at build time,
 * but `InjectTypeFnArgs` carries one or more `Fn` type arguments naming the
 * function families (`'val'`, `'verr'`, `'jsonEncoder'`, …) the site needs for
 * `T`. The Go backend emits only the demanded function caches and the runtime
 * resolves the precise factories without recomputing a key.
 *
 * SINGLE function (the common case) — `InjectTypeFnArgs<T, 'val'>`: the injected
 * value is the family's entry-module tuple, resolved by the one `createX`.
 *
 * `Fn` also names the JSON value-level primitives that have NO dedicated factory —
 * `'pj'`/`'pjs'` (mutate/clone prepare), `'rj'` (restore), `'sj'` (direct
 * stringify), `'ukuw'` (strip wire pre-pass), `'cj'`/`'cjr'` (compact
 * encode/decode). A wrapper recovers those from the injected tuple with the
 * generic `getRTFunction<'pjs'>(fns?.[i])` resolver (keyed by the SAME fnKey)
 * instead of a factory, so a framework that owns its own JSON envelope can pull a
 * per-strategy `prepareForJson` / `restoreFromJson` for `T` and apply it at the
 * value level (no string hop).
 *
 * MULTIPLE functions — `InjectTypeFnArgs<T, 'verr', 'jsonDecoder', 'jsonEncoder'>`:
 * the site needs several compiled fns for the same `T` (a framework wrapper such
 * as mion's `route()` asks for the validator, JSON decoder and JSON encoder in
 * one marker). The injected value is an ARRAY of entry-module tuples, ONE per
 * named family in declaration order, and the wrapper destructures it
 * positionally (`fns?.[0]`, `fns?.[1]`, …), forwarding each element to its
 * factory. This keeps a single trailing marker (one injection slot) rather than
 * several markers.
 *
 * ANY number of families is accepted, in declaration order — there is no fixed
 * three-key limit. A TypeScript type alias cannot declare a variadic type
 * parameter list, so the arity is a generous fixed count (`F1` … `F12`) that
 * comfortably exceeds the number of distinct public families; combined with the
 * duplicate-key rule below, that is effectively unbounded (a marker can never
 * meaningfully name more families than exist). Add another optional parameter
 * here if the family set ever grows past the cap.
 *
 * DUPLICATE families are a build error. Naming the same family twice
 * (`InjectTypeFnArgs<T, 'verr', 'verr'>`) is almost always a copy-paste slip —
 * the second entry would inject a redundant identical tuple — so the Go scanner
 * rejects it with `MKR006` (Error) at the call site. Use each family at most
 * once per marker.
 *
 * MULTIPLE MARKER PARAMETERS (multi-slot) — a signature may declare SEVERAL
 * injection-marker parameters, and each injects at its own index. A framework
 * wrapper can carry one marker per side, resolving a DIFFERENT `T` for each:
 *
 *   function route<H extends Handler>(
 *     handler: H,
 *     opts?: RouteOptions,
 *     paramsFns?: InjectTypeFnArgs<Params<H>, 'verr', 'jsonDecoder'>,
 *     responseFns?: InjectTypeFnArgs<Return<H>, 'jsonEncoder'>,
 *     meta?: InjectRunTypeId<Params<H>>,
 *   ) { … }
 *
 * The build fills every marker slot in one positional insertion, padding
 * non-marker optional gaps (`opts`) with `undefined`. A marker parameter the
 * caller supplies explicitly (a forwarded handle) is a pass-through, left
 * untouched. Mix `InjectTypeFnArgs` and `InjectRunTypeId` freely — this is how a
 * wrapper reads a type's runtype graph (via the reflection marker) alongside its
 * compiled functions without an extra call.
 *
 * The declared type mirrors `InjectRunTypeId`'s `string & {brand}` shape (rather
 * than a tuple type) so the Go marker scanner resolves the alias + its type
 * arguments the same way it does for `InjectRunTypeId` — a tuple-intersection
 * alias does not reliably preserve `T`/`Fn` on the resolved type. `T` and the
 * `Fn` keys are phantom; the runtime value is the injected (array of) tuples.
 */
export type InjectTypeFnArgs<
  T,
  F1 extends string,
  F2 extends string = never,
  F3 extends string = never,
  F4 extends string = never,
  F5 extends string = never,
  F6 extends string = never,
  F7 extends string = never,
  F8 extends string = never,
  F9 extends string = never,
  F10 extends string = never,
  F11 extends string = never,
  F12 extends string = never,
> = string & {
  readonly __rtInjectTypeFnArgsBrand?: T;
  readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12];
};

// NOTE: `any` is intentionally PERMITTED — there is no type-level `any` guard.
// `getRunTypeId<any>()` resolves a normal id; the runtime fn is a noop validator
// (accepts everything) and a best-effort serializer that emits a build-time
// diagnostic — the same treatment every other best-effort case gets. A
// type-level rejection would contradict that runtime behaviour, and can't be
// enforced anyway: the brand above is phantom (optional) and `any` is
// universally assignable, so it could never fire at a call site.

/**
 * Type-id marker. Returns the stable structural id of `T`. One function, two
 * call shapes — the optional value-first parameter mirrors every `createX`
 * factory:
 *
 *   - STATIC — bring the type, no value: `getRunTypeId<User>()`.
 *   - REFLECTION — let `T` be inferred from a runtime value:
 *     `getRunTypeId(user)`. The value is read only for its type; at runtime it
 *     is ignored, so nothing leaks into the output.
 *   - RUN-TYPE — pass the run-type a builder returned, get the id of the type
 *     it MODELS: `getRunTypeId(object({…}))`. `T` is the UNWRAPPED modeled
 *     type; without this overload `getRunTypeId(runType)` infers
 *     `T = RunType<…>` and returns the id of the `RunType` wrapper interface
 *     instead of the type the run-type describes. Mirrors `createMockDataFn`.
 *
 * Throws if the transformer is not active — the id can only be computed at
 * build time. The plugin injects the runtype's entry-module tuple at the
 * trailing `id` slot; the call registers the type (and its transitive children)
 * into rtUtils and returns the id string, so the public contract — "returns the
 * type id" — is unchanged.
 *
 * `T = any` is allowed (explicit `getRunTypeId<any>()`, or inferred from
 * `JSON.parse` / untyped library returns / `as any`): it resolves a normal id
 * whose runtime fn is a noop validator / best-effort serializer (with a
 * build-time diagnostic).
 */
// Run-type overload first so `getRunTypeId(runType)` binds `T` from
// `RunType<T>` rather than matching `(_value?: T)` with `T = RunType<T>`.
export function getRunTypeId<T>(runType: RunType<T>, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
export function getRunTypeId<T>(_value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
export function getRunTypeId<T>(_valueOrSchema?: T | RunType<T>, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (isEntryTuple(id)) {
    initFromTuple(id);
    return entryTupleKey(id) as InjectRunTypeId<T>;
  }
  if (id === undefined) {
    throw new Error('getRunTypeId(): no id injected. ts-runtypes-devtools must be active.');
  }
  return id as InjectRunTypeId<T>;
}

/**
 * Compile-time-args marker. Brands a parameter so the Go scanner enforces
 * that the matching argument is *fully literal* — at the call site or via a
 * module-scope `const` whose initializer is itself entirely literal. Spread of
 * a `const`-bound literal fragment IS allowed (`{...base, k: v}` /
 * `[...members, x]`, including an imported fragment), so shared config / schema
 * can be split into a `const` and merged at the call site. No calls, no
 * property access, no template substitution, no ternary; a spread whose operand
 * is dynamic or a shape mismatch (an object spread of an array, …) is still
 * rejected. Violations produce `CTA0xx` diagnostics.
 *
 * It is the IDENTITY `T` (the value flows through unwrapped, and the marker
 * adds zero type-check cost). It deliberately carries NO phantom brand
 * property: intersecting one onto a TUPLE parameter — the old
 * `T & {__rtCompTimeArgsBrand?: never}` used by `tuple`/`union`/`func` —
 * cost ~700 TS instantiations per call (the array-literal-vs-tuple-intersection
 * check). The Go scanner therefore detects this marker SYNTACTICALLY, off the
 * parameter's `CompTimeArgs<…>` type annotation, instead of off a brand property
 * on the resolved type.
 */
export type CompTimeArgs<T> = T;

/**
 * Compile-time fn-args marker. Like `CompTimeArgs<T>` it brands a parameter so
 * the Go scanner enforces the argument is *fully literal* (`CTA0xx`), but it
 * ALSO marks this as the parameter whose literal value selects the `createX`
 * function variant — the `ValidateOptions` bag for `createValidateFn` /
 * `createGetValidationErrorsFn`, the strategy for `createJsonEncoderFn` /
 * `createJsonDecoderFn`. The scanner reads it to compute the injected fn hash
 * (see `InjectTypeFnArgs`). A `{...preset, …}` spread is merged in source order
 * (last write wins), so a shared options preset selects the same variant as the
 * fully-inlined options. Phantom intersection; the value flows through
 * unwrapped.
 */
export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};

/**
 * Compile-time HINTS marker — the LENIENT sibling of `CompTimeArgs<T>`,
 * reusable by any function whose options carry build-readable knobs. It
 * marks a parameter the build READS best-effort but never validates: when
 * the argument is an object literal (or a `const` preset / spread chain the
 * scanner can resolve), statically readable values inside it are honored at
 * build time; anything dynamic stays perfectly legal and is simply
 * invisible to the build. No `CTA0xx` enforcement, no fn-variant selection,
 * nothing folds into any cache id.
 *
 * Current reader: `createMockDataFn`'s options — a literal `mock.seed`
 * makes the generated pattern mockSample pools reproducible across builds
 * (the same seed also drives the runtime pick, since factory options merge
 * into every call); without one, sample-less pattern pools are drawn fresh
 * on every build.
 *
 * Like `CompTimeArgs<T>` it is the IDENTITY `T` — no phantom brand property
 * (see the instantiation-cost note above) — and the Go scanner detects it
 * SYNTACTICALLY off the parameter's `CompTimeHints<…>` type annotation.
 */
export type CompTimeHints<T> = T;

/**
 * Pure-function marker — the DIRECT form. Brands a function-typed parameter as
 * the pure function ITSELF: the matching argument must be an inline arrow /
 * function expression that passes the purity rules (no `this`, no `await` /
 * `yield`, no dynamic `import`, no eval/Function, no outer-scope captures, no
 * forbidden hosts). The compiler WRAPS it into the zero-arg factory the runtime
 * cache stores (`() => fn`), so the author just writes the callback — this is
 * what lets a wrapper expose a single-callback API like `serverMapFrom(t => t.id)`.
 *
 * Use `PureFunctionFactory<F>` instead when the argument is a FACTORY that needs
 * one-time setup (compile a regex once) or `utl` composition.
 *
 * Strictly stronger than `CompTimeArgs<F>` when F is a function. Inline-shape
 * violations → `PFN001`; purity violations → `PFE9006`–`PFE9011`.
 */
export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};

/**
 * Pure-function-FACTORY marker — the FACTORY form. Brands a function-typed
 * parameter as a factory `(utl) => fn` that RETURNS the pure function. Same
 * inline + purity rules as `PureFunction<F>` (the whole factory is checked), but
 * the compiler emits it as-is instead of wrapping — so the factory body can do
 * one-time setup (a `const RE = /…/` compiled once) and compose other pure fns
 * via `utl.usePureFn('ns::id')` (tracked as a dependency).
 *
 * Pair with the `…Factory` registrars (`registerPureFnFactory`,
 * `registerAnonymousPureFnFactory`); use the plain `PureFunction<F>` marker (and
 * the plain registrars) when the argument is the callback itself.
 */
export type PureFunctionFactory<F> = F & {readonly __rtPureFunctionFactoryBrand?: never};

/**
 * Anonymous pure-fn injection marker — the content-addressed twin of the named
 * `registerPureFnFactory('<ns>::<name>', …)` lane. Like `InjectRunTypeId<T>` it
 * is a pure INJECTION marker (no literal double-duty): absent at author time,
 * the plugin fills the trailing `hash?` parameter with `"rt::<fnHash>"` where
 * `fnHash` is a content hash of the NORMALIZED function BODY (not of `<F>`, so
 * same-signature/different-body pure fns never collide). Because the marker
 * lives in the callee signature it propagates through wrappers — a library can
 * offer its own `registerXPureFn<F>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>)`
 * and the plugin injects at ITS call sites with zero scanner diagnostics.
 *
 * `F` is a phantom type parameter used only to link the marker to the sibling
 * `PureFunction<F>` argument; the runtime value is the injected string. Mirrors
 * `InjectRunTypeId`'s `string & {brand}` shape so the Go marker scanner resolves
 * the alias identically.
 */
export type InjectPureFnHash<F> = string & {
  readonly __rtInjectPureFnHashBrand?: F;
};
