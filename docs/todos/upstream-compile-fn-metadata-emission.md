# Upstream ask: `compile*Fn` — emit type metadata alongside the compiled function

**Status:** todo — **upstream change request for `@ts-runtypes/core`.** Nothing to build in mion
until upstream agrees a shape. Needs an issue filed in `ts-run-types` first.
**Type:** feature (upstream), then a mion cleanup
**Created:** 2026-08-20

Every new type-shape question mion needs answering (param names, optionality, return shape) costs a
bespoke field plus a hand-written walk over upstream's runtype graph. Retaining the `RunType`s
themselves on mion's method reflection does **not** fix that — it parks a recursive, possibly
circular graph in memory per method and mion still walks node internals for every question. The
answer belongs one layer down: in the compiler, which already knows all of it at build time.

## The ask

Today's public API is `createXFn<T>()` → a bare compiled function:

```ts
const isUser = createValidateFn<User>();          // packages/examples/src/run-types/validation-is-type.ts
const encodeUser = createJsonEncoderFn<User>();   // packages/examples/src/_homepage/home-run-types.ts
```

Proposal: a parallel **`compileXFn<T>()`** that returns the function **plus the metadata the
resolver already computed** to emit it — plain, build-time, serializable data. No graph, no runtime
`getRunType()` resolution, no retained nodes. Roughly:

```ts
const {fn, metadata} = compileValidateFn<HandlerParams<typeof savePet>>();
// metadata.isNoop  → false
// metadata.members → [{name: 'pet', optional: false}, {name: 'notes', optional: true}]
```

Candidate v1 metadata — chosen because it is exactly what mion reads today (see evidence below):

- **`isNoop`** — **the single most important field.** See below; it is a non-negotiable for v1.
- **tuple member labels** — `[pet: Pet, notes?: string]` → member `name` + `optional`
- **function signature shape** — parameter names, arity, optional/rest flags
- **return shape hint** — whether the type is `void` / `never` / `undefined` (mion's `hasReturnData`)
- **`binarySizeEstimate`** (`tb` family only) — already emitted into the `tb` entry tuple, but
  deliberately kept off the cache entry, so it is unreachable via `getRT()`. mion reads the tuple slot
  directly today; see [drop-binary-estimate-slot-read.md](drop-binary-estimate-slot-read.md), which can
  either land as a ~2-line standalone fix or fold into this channel.
- possibly **format name/params per member** (drizzle reads these from the graph too, see
  [drizzle-column-mapping-on-type-formats.md](drizzle-column-mapping-on-type-formats.md), though that
  spec solves its half in the *type* lane)

### `isNoop` is the field that matters most

Every other field on this list *describes* the type. `isNoop` lets the caller **skip the call
entirely** — it is the only one that removes work from the hot path rather than annotating it. A
validator for `any`, a JSON transform for a type that needs none, a serializer for a void return:
the compiler knows at build time that invoking it is pointless, and one emitted boolean turns a
per-request function call into a branch.

**mion already depends on this and already gates on it** — `isNoop` exists on upstream's
`CompiledFnData` today (read at `packages/core/src/runtypes/mionAdapter.ts:115`), which is exactly
why it is the proof the channel works. The gates:

| Gate | Skips |
| --- | --- |
| `router/src/dispatch.ts:178` | request validation |
| `router/src/dispatch.ts:160` | JSON restore of params — returns them untouched |
| `router/src/dispatch.ts:197`, `:205` | the whole `strictTypes` unknown-key pass |
| `client/src/lib/validation.ts:57` | client-side pre-validation |
| `client/src/lib/serializer.ts:133` | param prep — falls through to a plain `JSON.stringify` |
| `client/src/lib/serializer.ts:232` | return-value restore |
| `core/src/binary/bodySerializer.ts:71` | binary framing for that method |

So whatever shape `compileXFn` returns, **`isNoop` must ride on it** — if the metadata object omits
it, every one of these call sites still has to go find the `CompiledFnData` entry separately, and
the new API is strictly worse than what it replaces.

Two mion-side symptoms worth handing upstream as motivation, both consequences of `isNoop` only
existing on a cache entry rather than on the compiled fn itself:

- **mion fabricates noop fns.** `routerUtils.ts:274-302` hand-builds a `noopJitFns` set with
  `isNoop: true` and throwing bodies, for handlers with no params or a void return — cases where the
  compiler could simply have emitted `isNoop: true` on the real thing.
- **mion guesses `false` when it cannot tell.** `mionAdapter.ts:181` (`fabricateEntry`) hardcodes
  `isNoop: false` for a marker with no cache entry. That is the conservative direction — it costs a
  pointless call, it does not break — but it is a guess standing in for a fact the compiler had.

## Evidence — what mion hand-rolls today because the metadata is not emitted

All in `packages/core/src/runtypes/mionAdapter.ts`:

| Site | What it does |
| --- | --- |
| `RtNodeLike` (`:345`) | mion's **hand-written structural mirror** of an upstream runtype node (`kind`, `typeName`, `name`, `optional`, `child`, `children`) — every graph walk casts through it |
| `getParamsFromRunType` (`:277`) | `kind === RunTypeKind.tuple`, then reads `name` / `optional` off each child → param names + optionality |
| `getParamCountFromRunType` (`:269`) | arity, via the same walk |
| `runTypeHasData` (`:292`) | kind check against `void` / `never` / `undefined` |
| `getHeaderNamesFromRunType` (`:359`) | recurses unions, matches `kind === class && typeName === 'HeadersSubset'`, then digs `children → 'headers' → child.children` for the declared header names |

And each of these first has to **materialize the graph at runtime** purely to read a handful of
build-time-known strings — `resolveInjectedRunType(rtFns.paramsId)` at `:318`, `rtFns.returnId` at
`:317`, `rtFns.headersId` at `:421`, `rtFns.paramsId` again at `:429`.

The cost pattern is the point: **every new question is another `RtNodeLike` field plus another
walk.** Param names alone needed `getParamsFromRunType` *and* a `paramNames` field threaded
reflection → method → wire (see [../done/param-names-from-reflection.md](../done/param-names-from-reflection.md)).
The next one — per-parameter formats, defaults, descriptions for docs — repeats the whole exercise.

## Precedent: upstream already ships data next to a compiled fn

`CompiledFnData` already carries `isNoop`, `code`, `fnID`, `args` and `defaultParamValues` —
per-compiled-fn build-time data that mion consumes and even puts on the wire. 0.12.0 fixed
`defaultParamValues` to hold wire-safe strings instead of laundered runtime values
([../done/upstream-compiledfnargs-type-lie.md](../done/upstream-compiledfnargs-type-lie.md)).

`isNoop` in particular is the existence proof: a build-time fact, emitted as one boolean, that
consumers gate real work on. This ask is "more of that", not a new idea.

So "a compiled fn carries emitted data beside it" is an **established channel**, not a new
mechanism. This ask widens that channel from *calling-convention* data to *type-shape* data.

## Open questions to settle with upstream

1. **Shape.** `{fn, metadata}` tuple/object, or metadata hung on the returned function
   (`fn.metadata`)? The latter keeps `compileXFn` drop-in at call sites; the former is cleaner and
   does not put a non-callable property on a hot-path function. Upstream's call.
2. **Coexist or replace?** `createXFn` must almost certainly stay — most consumers (mion's own
   examples: `home-run-types.ts`, `strict-types-example.ts`, `serialization-*.ts`) want a bare
   function and should not pay for metadata they never read.
3. **v1 metadata set.** `isNoop` is not negotiable (above). Tuple labels + optionality + arity +
   return-has-data covers four of mion's five walks. `HeadersSubset` header names is mion-specific
   class introspection — either it stays a mion walk, or v1 includes a generic "declared property
   names for a class/object node" entry that mion composes on top. Decide explicitly rather than
   half-covering it.
   Related: should the compiler emit `isNoop: true` for the cases mion currently fabricates
   (no params, void return), so `noopJitFns` can be deleted rather than hand-maintained?
4. **Opt-in?** Metadata is emitted per compiled fn per call site, so it is bundle size for everyone.
   Should it be gated behind an emit option (mion would turn it on via `mionVitePlugin`)?
5. **Wire safety.** mion ships some of this to the browser. Confirm plain JSON: no symbols, no
   circular refs, and **no `undefined` values** — that exact shape is what broke the methods-metadata
   route in the `CompiledFnArgs` bug (the `sj` stringifier emitted literal `undefined`, invalid JSON).

## Fix plan

1. **File the upstream issue** in `ts-run-types`, using mion's five call sites above as the
   motivating consumer, `isNoop` as the lead argument (already emitted, already load-bearing on
   seven hot paths), and the `CompiledFnData` precedent as the proposed channel.
2. Agree shape + v1 metadata set upstream. **Record the decision back into this spec.**
3. Once it lands and mion upgrades: replace `getParamsFromRunType`, `getParamCountFromRunType`,
   `runTypeHasData` (and `getHeaderNamesFromRunType` if covered) with metadata reads, and delete
   `RtNodeLike`.
4. Drop the `resolveInjectedRunType()` calls that exist only to answer shape questions.
5. `RtMethodReflection` keeps `paramsCount` / `paramNames` / `hasReturnData` and the wire shape is
   unchanged — only the *source* of the values changes. This is not a public-API change for mion.

## Done when

- An upstream issue exists and its outcome is recorded here: accepted with an agreed shape, or
  declined with the reasoning (in which case mion keeps the walks and this spec closes).
- If shipped: mion reads emitted metadata instead of walking the graph, and `RtNodeLike` is gone.
- `isNoop` reaches the call sites through the metadata, not through a separate `CompiledFnData`
  lookup — and if the compiler emits it for zero-param/void-return types, `noopJitFns` and
  `fabricateEntry`'s hardcoded `isNoop: false` go with it.
- **Explicitly NOT done** by attaching `RunType` graphs to `RtMethodReflection` — that direction was
  considered and rejected on 2026-08-20.
