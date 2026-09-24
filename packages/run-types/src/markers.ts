// Marker primitives — the type-level brands the Go binary scanner recognizes at call sites. The
// `Inject*` ones are filled in at build time by `@mionjs/devtools`; `CompTimeArgs` / `PureFunction`
// are static checks only. A wrapper around `getRunTypeId` / `getRunType` declaring the same trailing
// `id?: InjectRunTypeId<T>` parameter gets injection at ITS call sites, and must resolve the handle
// by FORWARDING it as the trailing argument (`getRunType<T>(undefined, id)`), which the build leaves
// untouched. Do NOT hand the handle to `getRTUtils().getRunType()` — that takes a string id and
// returns undefined for it.

import {entryTupleKey, initFromTuple, isEntryTuple} from './runtypes/entryTuple.ts';
import type {RunType} from './runtypes/types.ts';

/**
 * Sentinel marker; `T` is phantom, read only by the checker / transformer. Branded `string` so a
 * wrapper's `id?` parameter reads as a string and stringly-typed APIs cannot satisfy the marker by
 * accident. At RUNTIME the injected value is an OPAQUE entry-module tuple carrying `T`'s type graph
 * for lazy registration, NOT a bare hash string — resolve it by forwarding it to `getRunType` /
 * `getRunTypeId` (see the wrapper note above), never by indexing `getRTUtils().getRunType()`.
 */
export type InjectRunTypeId<T> = string & {
  readonly __rtInjectRunTypeIdBrand?: T;
};

/**
 * Trailing-slot injection marker for the `createX` factories. Like `InjectRunTypeId<T>` the
 * transformer fills the `id?` parameter at build time, but `InjectTypeFnArgs` also names, through
 * its `Fn` type arguments, the function families (`'validate'`, `'validationErrors'`,
 * `'jsonEncoder'`, …) the site needs for `T`. The Go backend emits only the demanded function
 * caches and the runtime resolves the precise factories without recomputing a key.
 *
 * SINGLE function (the common case) — `InjectTypeFnArgs<T, 'validate'>`: the injected value is the
 * family's entry-module tuple, resolved by the one `createX`.
 *
 * JSON value families (`prepareForJsonClone`, `compactFromJson`, …) recover via `getRTFunction<Key>(fns?.[i])`.
 *
 * MULTIPLE functions — `InjectTypeFnArgs<T, 'validationErrors', 'jsonDecoder', 'jsonEncoder'>`, as a
 * framework wrapper such as mion's `route()` asks for: the injected value is an ARRAY of
 * entry-module tuples, ONE per named family in declaration order, and the wrapper destructures it
 * positionally (`fns?.[0]`, `fns?.[1]`, …), forwarding each element to its factory. Keeps a single
 * injection slot rather than several markers.
 *
 * ANY number of families is accepted, in declaration order — there is no fixed three-key limit. A
 * TypeScript type alias cannot declare a variadic type parameter list, so the arity is a fixed
 * `F1` … `F12` that comfortably exceeds the number of distinct public families; add another optional
 * parameter here if the family set ever grows past the cap.
 *
 * DUPLICATE families are a build error: the second entry would inject a redundant identical tuple,
 * so the Go scanner rejects `InjectTypeFnArgs<T, 'validationErrors', 'validationErrors'>` with
 * `MKR006` (Error) at the call site. Use each family at most once per marker.
 *
 * MULTIPLE MARKER PARAMETERS (multi-slot) — a signature may declare SEVERAL injection-marker
 * parameters, each injecting at its own index, so a framework wrapper can carry one marker per side
 * and resolve a DIFFERENT `T` for each:
 *
 *   function route<H extends Handler>(
 *     handler: H,
 *     opts?: RouteOptions,
 *     paramsFns?: InjectTypeFnArgs<Params<H>, 'validationErrors', 'jsonDecoder'>,
 *     responseFns?: InjectTypeFnArgs<Return<H>, 'jsonEncoder'>,
 *     meta?: InjectRunTypeId<Params<H>>,
 *   ) { … }
 *
 * The build fills every marker slot in one positional insertion, padding non-marker optional gaps
 * (`opts`) with `undefined`. A marker parameter the caller supplies explicitly (a forwarded handle)
 * is a pass-through, left untouched. Mix `InjectTypeFnArgs` and `InjectRunTypeId` freely — that is
 * how a wrapper reads a type's runtype graph alongside its compiled functions without an extra call.
 *
 * The declared type mirrors `InjectRunTypeId`'s `string & {brand}` shape rather than a tuple type so
 * the Go marker scanner resolves the alias + its type arguments identically — a tuple-intersection
 * alias does not reliably preserve `T`/`Fn` on the resolved type. `T` and the `Fn` keys are phantom;
 * the runtime value is the injected (array of) tuples.
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

// NOTE: `any` is intentionally PERMITTED — `getRunTypeId<any>()` resolves a normal id whose runtime
// fn is a noop validator and a best-effort serializer with a build-time diagnostic, so a type-level
// rejection would contradict that. It could not fire anyway: the brand above is phantom (optional)
// and `any` is universally assignable.

/**
 * Type-id marker. Returns the stable structural id of `T`. Three call shapes, the optional
 * value-first parameter mirroring every `createX` factory:
 *
 *   - STATIC — bring the type, no value: `getRunTypeId<User>()`.
 *   - REFLECTION — let `T` be inferred from a runtime value: `getRunTypeId(user)`. The value is read
 *     only for its type; at runtime it is ignored, so nothing leaks into the output.
 *   - RUN-TYPE — pass the run-type a builder returned, get the id of the type it MODELS:
 *     `getRunTypeId(object({…}))`. `T` is the UNWRAPPED modeled type; without this overload
 *     `getRunTypeId(runType)` infers `T = RunType<…>` and returns the id of the `RunType` wrapper
 *     interface instead. Mirrors `createMockDataFn`.
 *
 * Throws if the transformer is not active — the id can only be computed at build time. The plugin
 * injects the runtype's entry-module tuple at the trailing `id` slot; the call registers the type
 * (and its transitive children) into rtUtils and returns the id string.
 *
 * `T = any` is allowed (explicit, or inferred from `JSON.parse` / untyped library returns /
 * `as any`): it resolves a normal id whose runtime fn is a noop validator / best-effort serializer,
 * with a build-time diagnostic.
 */
// Run-type overload first so `getRunTypeId(runType)` binds `T` from `RunType<T>` rather than
// matching `(_value?: T)` with `T = RunType<T>`.
export function getRunTypeId<T>(runType: RunType<T>, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
export function getRunTypeId<T>(_value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
export function getRunTypeId<T>(_valueOrSchema?: T | RunType<T>, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (isEntryTuple(id)) {
    initFromTuple(id);
    return entryTupleKey(id) as InjectRunTypeId<T>;
  }
  if (id === undefined) {
    throw new Error('getRunTypeId(): no id injected. @mionjs/devtools must be active.');
  }
  return id as InjectRunTypeId<T>;
}

/**
 * Compile-time-args marker. Brands a parameter so the Go scanner enforces that the matching argument
 * is *fully literal* — at the call site or via a module-scope `const` whose initializer is itself
 * entirely literal. Spread of a `const`-bound literal fragment IS allowed (`{...base, k: v}` /
 * `[...members, x]`, imported fragments included), so shared config / schema can be split into a
 * `const` and merged at the call site. No calls, no property access, no template substitution, no
 * ternary; a dynamic spread operand or a shape mismatch (an object spread of an array, …) is
 * rejected. Violations produce `CTA0xx` diagnostics.
 *
 * It is the IDENTITY `T`, with NO phantom brand property: intersecting one onto a TUPLE parameter
 * (the old `T & {__rtCompTimeArgsBrand?: never}` used by `tuple`/`union`/`func`) cost ~700 TS
 * instantiations per call. The Go scanner therefore detects this marker SYNTACTICALLY, off the
 * parameter's `CompTimeArgs<…>` type annotation, not off a brand property on the resolved type.
 */
export type CompTimeArgs<T> = T;

/**
 * Compile-time fn-args marker. Like `CompTimeArgs<T>` it enforces a *fully literal* argument
 * (`CTA0xx`), but it ALSO marks this as the parameter whose literal value selects the `createX`
 * function variant — the `ValidateOptions` bag for `createValidateFn` /
 * `createGetValidationErrorsFn`, the strategy for `createJsonEncoderFn` / `createJsonDecoderFn`. The
 * scanner reads it to compute the injected fn hash (see `InjectTypeFnArgs`). A `{...preset, …}`
 * spread is merged in source order (last write wins), so a shared options preset selects the same
 * variant as fully-inlined options. Phantom intersection; the value flows through unwrapped.
 */
export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};

/**
 * Compile-time HINTS marker — the LENIENT sibling of `CompTimeArgs<T>`, for any function whose
 * options carry build-readable knobs. The build READS the parameter best-effort but never validates
 * it: statically readable values inside an object literal (or a `const` preset / spread chain the
 * scanner can resolve) are honored at build time, anything dynamic stays legal and is invisible to
 * the build. No `CTA0xx` enforcement, no fn-variant selection, nothing folds into any cache id.
 *
 * Current reader: `createMockDataFn`'s options — a literal `mock.seed` makes the generated pattern
 * mockSample pools reproducible across builds (the same seed also drives the runtime pick, since
 * factory options merge into every call); without one, sample-less pattern pools are drawn fresh on
 * every build.
 *
 * Like `CompTimeArgs<T>` it is the IDENTITY `T` — no phantom brand property (see the
 * instantiation-cost note above) — and the Go scanner detects it SYNTACTICALLY off the parameter's
 * `CompTimeHints<…>` type annotation.
 */
export type CompTimeHints<T> = T;

/**
 * Pure-function marker — the DIRECT form. The matching argument must be an inline arrow / function
 * expression that passes the purity rules (no `this`, no `await` / `yield`, no dynamic `import`, no
 * eval/Function, no outer-scope captures, no forbidden hosts). The compiler WRAPS it into the
 * zero-arg factory the runtime cache stores (`() => fn`), so the author writes just the callback,
 * which is what lets a wrapper expose a single-callback API like `inputFrom(t => t.id)`.
 *
 * Use `PureFunctionFactory<F>` instead when the argument is a FACTORY needing one-time setup
 * (compile a regex once) or `utl` composition.
 *
 * Strictly stronger than `CompTimeArgs<F>` when F is a function. Inline-shape violations → `PFN001`;
 * purity violations → `PFE9006`–`PFE9011`.
 */
export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};

/**
 * Pure-function-FACTORY marker — the argument is a factory `(utl) => fn` RETURNING the pure function.
 * Same inline + purity rules as `PureFunction<F>` (the whole factory is checked), but the compiler
 * emits it as-is instead of wrapping, so the factory body can do one-time setup (a `const RE = /…/`
 * compiled once) and compose other pure fns via `utl.usePureFn(otherId)` (tracked as a dependency).
 *
 * Pair with `registerPureFnFactory`; use `PureFunction<F>` (and `registerPureFn`) when the argument
 * is the callback itself.
 */
export type PureFunctionFactory<F> = F & {readonly __rtPureFunctionFactoryBrand?: never};

/**
 * Pure-fn id injection marker. A pure INJECTION marker like `InjectRunTypeId<T>` (no literal
 * double-duty): absent at author time, the build fills the trailing `id?` parameter with the
 * registration's id, which is where it lives — its package, its file and the name it is bound to
 * (`@acme/text/src/slug#slugify`). A registration bound to no name is identified by a hash of its
 * body instead, so two structurally identical callbacks collapse to one entry. Living in the callee
 * signature, it propagates through wrappers: a library can offer its own
 * `registerXPureFn<F>(fn: PureFunction<F>, id?: InjectPureFnId<F>)` and the build injects at ITS
 * call sites with zero scanner diagnostics.
 *
 * `F` is phantom, linking the marker to the sibling `PureFunction<F>` argument; the runtime value is
 * the injected string. Mirrors `InjectRunTypeId`'s `string & {brand}` shape so the Go marker scanner
 * resolves the alias identically.
 */
export type InjectPureFnId<F> = string & {
  readonly __rtInjectPureFnIdBrand?: F;
};

/**
 * Request-batch id injection marker, declared as the trailing parameter of a builder that runs
 * several routes in one request (`batch<Routes>(routes: [...Routes], batchId?: InjectBatchId<Routes>)`):
 * the build reads the ordered route ids out of the array argument, hashes them into a stable id and
 * fills the slot with it. The server carries the same id in its compiled batch table, so the wire
 * needs nothing but the id.
 *
 * `Routes` is phantom, linking the marker to the routes argument; the runtime value is the injected
 * string. Same `string & {brand}` shape as `InjectRunTypeId` so the Go marker scanner resolves the
 * alias identically.
 */
export type InjectBatchId<Routes> = string & {
  readonly __rtInjectBatchIdBrand?: Routes;
};

/**
 * API metadata injection marker for a mion client built with `bundleApi`. A client dispatch point
 * (`routes.x(...).call()`, `middlewares.y(...).prefill()`, `typeErrors()`, `batch([...]).call()`)
 * declares it as its trailing parameter, typed with the API and the id of the route it calls
 * (`call(setup?, apiMetadata?: InjectApiMetadata<Api, Id>)`). The build resolves that route (plus
 * every middleware in its chain) out of the API type, compiles the same validators and serializers the
 * server holds, and fills the slot with an import of the generated module carrying them. Without the
 * build option nothing is injected and the client fetches its metadata from the server as before.
 *
 * The LANE itself (`bundled` or `mixed`) is a build option, not a call-site fact, so it does not
 * ride this marker: the build writes a module that sets it and imports that module into every file
 * calling `initClient`, the way the batch transport reaches a server.
 *
 * `Api` and `Id` are phantom, read by the build; the injected runtime value is the generated
 * module's export (an object holding the method rows), NOT a string like `InjectRunTypeId`, and the
 * type is the brand alone to stay honest about that — the scanner matches a marker by its name,
 * module and brand property, never by what it wraps.
 */
export type InjectApiMetadata<Api, Id extends string> = {
  readonly __rtInjectApiMetadataBrand?: [Api, Id];
};

/**
 * API version injection marker on the trailing parameter of `initRoutes(routes, buildVersion?)` and
 * `initClient(options, buildVersion?)`: the build hashes the compiled ids of the API type's methods into the
 * slot. Derived from the types alone, never from a build stamp, so two builds of one API agree.
 *
 * The slot stays empty for a client reading the API without `api.tsConfig` and without importing the router:
 * it resolved those types under its own compiler settings, so its ids may differ with nothing wrong.
 *
 * `Api` is phantom; the `string & {brand}` shape matches `InjectRunTypeId` so the Go scanner resolves it identically.
 */
export type InjectBuildVersion<Api> = string & {
  readonly __rtInjectBuildVersionBrand?: Api;
};

/** `initClient`'s router options slot: the build fills it with the options a client acts on, as an object literal,
 *  read off the API type's `ROUTER_OPTIONS` key. Same trust rule as `InjectBuildVersion`. */
export type InjectRouterOptions<Api> = {readonly syncRoutes?: boolean} & {
  readonly __rtInjectRouterOptionsBrand?: Api;
};
