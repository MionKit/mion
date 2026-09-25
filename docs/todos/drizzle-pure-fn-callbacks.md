---
type: feature
spec: guidelines
status: ready
created: 2026-09-25
---

# A table type can name its callbacks as pure functions

## Intent

A drizzle column's runtime callbacks (`$default`, `$defaultFn`, `$onUpdate`, `$onUpdateFn`, and
`customType`'s `toDriver` / `fromDriver`) have no type spelling. A builder holds the live
function, so the builder road is fine. A hand-written table type only records `{$defaultFn: true}`,
and the callback has to be passed again at run time:

```ts
type Posts = PgTable<'posts', {slug: Text<{$defaultFn: true}>}>;
tableFromType<Posts>({runtime: {slug: {$defaultFn: () => crypto.randomUUID()}}});
```

Mion already gives inline functions a build-time identity: pure functions. The goal is a table
type that names its callback as a pure function, so `tableFromType<T>()` needs no `runtime`
option and `mion convert` round-trips the callback.

## What is known

- **Ids.** A pure function's id is `<package>#pf_<14-char base64url sha256 of its shipped body>`
  (`IDFor` in `ts-go-runtypes/internal/cachegen/purefunctions/id.go`, `CodeHash` in `hash.go`,
  built in `buildPureFnEntry` in `walker.go`).
- **Why a type cannot name one today.** `registerPureFn` returns `PureFnId<ID>` with `ID`
  defaulting to `string` (`packages/run-types/src/runtypes/pureFn.ts:85-99`), so
  `typeof myFn` is `PureFnId<string>` in source AND in an emitted `.d.ts`
  (`cachegen/.../deps.go` around lines 198-199). A literal id only appears when the source passes
  one, and a hand-written id must equal the hash (PFE9014, `walker.go` around lines 363-376).
- **Reflection never sees an id.** Nothing in `cachegen/runtype/typeid` or `serialize.go` maps a
  type to a pure-fn id; `PureFnId<...>` reflects as an ordinary branded string. The one pure-fn
  input to a structural id is `overrideX<T>(pureFn)`, from a value-side table
  (`typeid/overrides.go`).
- **The closest existing pattern** is the client's `inputFrom(source, mapper: PureFunction<...>,
  id?: InjectPureFnId<...>)` (`packages/rpc-client/src/batch.ts:80`): the build extracts the inline
  mapper, injects its id, and the server manifest ships the body (`compiler/resolver/rpcgen.go`).
- **Getting a body into the build.** A registration call in the program's sources is always a
  root; a reference from another body is a soft dependency fetched from installed packages
  (`resolver/package_purefns.go`); `inputFrom` goes into the rpc manifest. The runtime looks one
  up with `getRTUtils().getCompiledPureFnByKey(id)`, untracked.
- **Purity rules** (the website's pure-functions guide): self-contained, no outer captures, no
  `this`, no `await` / `yield`, no dynamic import, sync only. Real schemas often capture an import
  (`() => createId()`), so pure callbacks must be OPT-IN; a non-pure callback keeps the `runtime`
  option.
- **No build step still has to work**: drizzle-kit loads the schema file without mion's build, so
  a builder must keep the live function and never throw for a missing id (unlike `inputFrom`).

## Directions to decide while planning

- How the id reaches the TYPE. Candidates: the resolver resolves a `typeof registeredConst`
  member of a column type to the registration's id while reflecting the table; or a pure-callback
  wrapper whose call site the build rewrites into a literal-id type annotation; or something the
  investigation turns up. Pick by prototype and measure the reflection cost.
- The spelling in the props object, for builders and for the hand-written type, and how the models
  and `toDrizzle` read it (a pure callback still sets hasDefault / runtimeDefault).
- `tableFromType<T>()` resolving the body from the registry with no `runtime` option, and the Go
  convert program round-tripping it.

## Done when

- A hand-written table spells a pure callback, `tableFromType<T>()` rebuilds it with no `runtime`
  option, and convert round-trips it.
- A non-pure callback still works through `runtime`; a purity violation reports the pure-fn
  diagnostic at the call site; the id is stable across builds.
- Go and vitest tests cover both `getRunTypeId` call shapes where a marker is involved; docs
  updated for the drizzle callbacks section.
