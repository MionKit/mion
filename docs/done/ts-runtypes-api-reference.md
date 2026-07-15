# @ts-runtypes/* — the API mion consumes

**Status:** done (completed-migration record)
**Created:** 2026-07-11

> mion now consumes **`@ts-runtypes/*@0.9.2`** from npm. This reference was first written against
> ts-run-types `main` (`eb7b618`, 2026-07-11); the marker / factory / `getRTFunction` surface
> below is unchanged and still accurate. 0.9.2 additions mion relies on (enumerability guard +
> `@nonEnumerable`, generic class serializers, id-relevant tuple labels, pattern-message,
> mockSample validation) are covered in [04-progress-log.md](progress-log.md) and [done/](./).

## Packages

| Package | Role | Notes |
| --- | --- | --- |
| `@ts-runtypes/core` | markers + runtime (factories, entry-tuple cache, formats, mocking, enrich) | zero runtime deps; ESM `dist/` + CJS `dist/cjs/` |
| `@ts-runtypes/devtools` | vite plugin (unplugin-based): spawns the Go resolver, rewrites call sites, serves `virtual:rt/*` modules | peerDeps `vite >=5`, `@ts-runtypes/bin`; dep `unplugin@3.3.0` |
| `@ts-runtypes/bin` | platform launcher `getExePath()` | platform binary optional-deps injected at **publish only** |

## The execution model (vs old mion run-types)

Old mion: deepkit-style type compiler emits runtime type metadata → run-types builds RunType objects at runtime → JIT-compiles validators/serializers (jitUtils in core caches them).

ts-runtypes: **all compilation is build-time.** The vite plugin scans call sites of functions whose trailing optional params are typed with *injection markers*, asks the Go resolver (real tsgo checker) for the instantiated `T` at each call site, and injects precompiled *entry-module tuples* (virtual modules) as the trailing args. Runtime just resolves tuples into functions. No runtime reflection, no runtime codegen, no metadata side tables.

## Markers (`packages/ts-runtypes/src/markers.ts`)

- `InjectRunTypeId<T>` — reflection handle for `T` (branded string; runtime value is an entry tuple). Resolve by **forwarding**: `getRunTypeId<T>(undefined, id)` / `getRunType<T>(undefined, id)`. Forwarded calls are pass-throughs — the build leaves them alone.
- `InjectTypeFnArgs<T, F1, …F12>` — asks for 1..12 compiled function families for `T`. Single key → injected value is the family's entry tuple; multiple keys → **array of tuples in declaration order** (`fns?.[0]`, `fns?.[1]`…). Duplicate family in one marker = build error `MKR006`.
- **Multi-slot**: one signature may declare SEVERAL marker params, each injected at its own index, `undefined`-padding non-marker optional gaps. Mixing `InjectTypeFnArgs` + `InjectRunTypeId` in one signature is supported — markers.ts documents exactly the mion `route()` shape:

```ts
function route<H extends Handler>(
  handler: H,
  opts?: RouteOptions,
  paramsFns?: InjectTypeFnArgs<Params<H>, 'verr', 'jsonDecoder'>,
  responseFns?: InjectTypeFnArgs<Return<H>, 'jsonEncoder'>,
  meta?: InjectRunTypeId<Params<H>>,
) { … }
```

- Wrapper functions (declared in ANY package, e.g. `@mionjs/router`) are first-class: the scanner recognizes marker-typed params by resolving the marker alias back to the `ts-runtypes` package (package.json name walk), then rewrites the *wrapper's* call sites.
- `CompTimeArgs<T>` / `CompTimeFnArgs<T>` — argument must be fully literal at the call site (`CTA0xx` diagnostics); `CompTimeFnArgs` additionally selects the function variant (folded into the injected fnHash).
- `T = any` is permitted (noop validator / best-effort serializer + build diagnostic).

## Factories (`packages/ts-runtypes/src/createRTFunctions.ts`, index exports)

All are value-first: `createX<T>()` (static), `createX(value)` (inferred), `createX(schema)` (RunType builder schema). Options bags must be call-site literals (`CompTimeFnArgs`).

| Factory | fnKey | Returns |
| --- | --- | --- |
| `createValidate<T>(v?, opts?)` | `val` | `ValidateFn<T> = (v: unknown) => v is DataOnly<T>` |
| `createGetValidationErrors<T>(v?, opts?)` | `verr` | `(value, path?, errors?) => RTValidationError[]` — `{path, expected, format?}` |
| `createHasUnknownKeys<T>` | `huk` | `(value, opts?) => boolean` |
| `createStripUnknownKeys<T>` | `suk` | `(value) => value` (mutates) |
| `createUnknownKeyErrors<T>` | `uke` | `(value, path?, errors?) => RTValidationError[]` |
| `createUnknownKeysToUndefined<T>` | `uku` | `(value) => value` |
| `createFormatTransform<T>` | `fmt` | applies TypeFormat transforms (trim/lowercase/…) |
| `createJsonEncoder<T>(v?, {strategy?})` | `jsonEncoder` | `(value) => string \| undefined`; strategies `clone` (default) / `mutate` / `direct` / `compact` |
| `createJsonDecoder<T>(v?, {strategy?})` | `jsonDecoder` | `(serialized: string) => DataOnly<T>`; strategies `strip` (default) / `preserve` / `compact` |
| `createToBinary` / `createFromBinary` | `tb` / `fb` | binary codec |
| `createMockData<T>` | — (`InjectRunTypeId`) | mock generation |

`ValidateOptions`: `noLiterals`, `noIsArrayCheck`, `rejectCircularRefs` (runtime-only, not in fnHash).

## `getRTFunction<K>(injected, fallback?)` — the mion-critical API

`packages/ts-runtypes/src/createRTFunctions.ts:485`. Generic resolver keyed by fnKey; the ONLY way to reach the **value-level JSON primitives** that have no factory:

| fnKey | Type | Meaning |
| --- | --- | --- |
| `pj` | `PrepareForJsonFn = (v: unknown) => unknown` | prepare for JSON, **mutate** walk |
| `pjs` | `PrepareForJsonFn` | prepare for JSON, **clone** walk (strips undeclared keys) |
| `rj` | `RestoreFromJsonFn = (v: unknown) => unknown` | restore typed value from JSON-safe value |
| `sj` | `StringifyJsonFn = (v: unknown) => string \| undefined` | direct value → JSON string |
| `ukuw` | `RestoreFromJsonFn` | strip-decoder unknown-keys wire pre-pass |
| `cj` / `cjr` | prepare/restore | compact positional wire |

…plus every factory-backed key (`val`, `verr`, `jsonEncoder`, …) resolves through it too. Usage (mion serialization, per the maintainer):

```ts
function jsonValueCodec<T>(fns?: InjectTypeFnArgs<T, 'pjs', 'rj'>) {
  const prepare = getRTFunction<'pjs'>(fns?.[0]); // PrepareForJsonFn
  const restore = getRTFunction<'rj'>(fns?.[1]);  // RestoreFromJsonFn
}
```

Behavior: registers the tuple's dep closure, returns the compiled fn. Missing-stub/key-miss → `fallback` (default identity). **No tuple at all (plugin inactive) → throws** with an actionable hint. Root `undefined`/`void` are handled inside the primitives (no throw), so a framework that owns its own JSON envelope can apply them per-value with no string hop.

## Runtime cache & virtual modules

- Every injected tuple is (or imports) a `virtual:rt/*` module emitted by the plugin; ids are content-addressed and embed the binary version.
- `getRunTypeId` registers the type graph on first call and returns the stable structural id string.
- `getRunType<T>(undefined, id)` returns the `RunType` graph node (for metadata needs).
- Validation contract: **serializable data only** — functions/methods/symbols are dropped from validation (build Warning VL010-13); at root/propagating positions they become build Errors. Decoders return `DataOnly<T>`.

## Vite plugin (`@ts-runtypes/devtools`)

- Export: unplugin-based vite plugin; `binary` option optional (defaults to `getExePath()`).
- Options seen in repo: `binary`, `transformMode: 'go' | 'edits'` (default `edits`), `moduleMode`, `inlineMode`, `emitMode: 'code' | 'functions' | 'both'`, disk cache dir.
- Works under vitest (ts-run-types' own plugin tests run through vitest + the plugin).

- mion wires it through `mionVitePlugin` (`@mionjs/devtools/vite-plugin`), which maps the legacy
  option shape onto `tsRuntypes({...})` and adds `failOnError` (default false in mion) +
  `allowUncheckedPatterns` passthroughs. Full 0.9.2 plugin options: `binary`, `tsconfig`, `outDir`,
  `emitMode`, `moduleMode`, `inlineMode`, `transformMode`, `sourcesContent`, `failOnError`,
  `allowUncheckedPatterns`.
