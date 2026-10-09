# Architecture invariants

Load-bearing pipeline rules. Read before touching markers, rewrites, caches, validators / decoders or the router.

## Markers and rewrites

- Marker self-import: marker package's own tests import `@mionjs/run-types` → must resolve to `src/` (not `dist/`)
  via a `source` export condition on BOTH vitest and tsgo.
  Drop either → dev tests break when `dist/` is stale or missing.
- Rewrites use UTF-8 byte offsets, converted via `makeByteToChar` before indexing.
  Applied through an in-house `EditBuffer`, a Go ⇄ JS twin.
- Two wire modes (`transformMode: 'go' | 'edits'`) byte-identical by construction, pinned by a mode-parity corpus.
- Two markers: `InjectRunTypeId<T>` (injects typeId) drives the reflection cache.
  `InjectTypeFnArgs<T, Fn>` (injects typeId + opaque 4-char fnHash) drives per-family caches.
- Caches are demand-driven: hold ONLY the types their own call sites demand.
  A `getRunTypeId`-only file emits ZERO function-cache entries.

## Validate contract: serializable data only

- Validators / decoders operate on the JSON-shaped projection of `T`.
- Non-serialisable members (functions, symbols, getters) drop with a build-time **Info** (hidden unless
  `levels: 'all'`). Decoders return `DataOnly<T>`.
- `any` / `unknown` the author wrote ARE data, kept for third-party types: accepted at every position in every
  family (a required member only needs its key). An Info at a root, never an error.
- `any` from an unresolved name, import or lib = RuntimeError: `marker-any-from-unresolved-import`,
  `marker-any-from-unresolved-name`, `marker-temporal-lib-missing`, `config-lib-missing-base`.
- Pinned by: `TestNestedDiagCorpus` tests (diagnostics), `writtenAnyUnknown.test.ts` (runtime).
- **Info** = expected drop, fine. **Error** = will throw at runtime, build must fail.

## Decode before validate

- Validation runs on the restored value → the decoder guards the wire shape.
- A JSON restore arm converts only the exact wire form (a Date from a string, a bigint from a whole-number string,
  a Map/Set from an array). Anything else is left for validate.
- Kinds that convert: `reflection.MustValidateJson` (`ts-go-runtypes/internal/reflection/must_validate_json.go`).
- Arm shipped without its guard → a Go test + the `GC-GUARD` generated-code oracle fail.
- Rule details: [typefunctions/AGENTS.md](../../ts-go-runtypes/internal/cachegen/typefunctions/AGENTS.md).

## Request pipeline

- `@mionjs/router` executes typed handlers declared through the helpers `createMionRouter(opts)` returns
  (`mion.route()` / `mion.middleware()`). Rules: [rpc-router/AGENTS.md](../../packages/rpc-router/AGENTS.md).
- Router uses the compiled validators/serializers the runtypes caches provide (via `@mionjs/core`'s reflection
  adapter). `platform-*` adapters wrap the router per runtime.
- `@mionjs/client` calls routes with the same compiled functions serialized into the client bundle
  → `@mionjs/devtools` rejects `emitMode: 'functions'`.
