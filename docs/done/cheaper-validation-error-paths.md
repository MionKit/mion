---
type: fix
spec: guidelines
status: done
created: 2026-11-01
---

# Cheaper Error Paths in getValidationErrors

## Intent

The path bookkeeping in `createGetValidationErrorsFn` costs time on BOTH paths, not only when an error is
built:

- **Valid input (happy path)**: every call allocates the default `pth=[]` and `er=[]`, and every call to a
  non-inlined child (named compounds, recursive and circular types) wraps it in `pth.push(...)` /
  `pth.splice(-N)`. `splice` returns a new array of the removed items, so each child call allocates even
  when nothing fails. A first micro-measurement of mion's own recursive array fn on valid input only:
  `splice(-1)` 3.7-7.0M ops/s, `pth.pop()` 10.7-19.8M ops/s (about 3x), `pth.length -= 1` no better than
  splice.
- **Invalid input (fail path)**: each error snapshots the path with two array spreads. In the validation
  benchmark ajv's compiled error code beats mion there (e.g. OBJECT.simple_interface ~27M vs ~16M ops/s,
  ARRAY.number_array ~37M vs ~16M, 4-core x86 cloud box). The checks are the same; the cost is the copy.

Make both cheaper without changing a single path value, error object or public type.

Why it is delicate: the generated code shares ONE mutable `pth` array across the whole walk, pushing
segments before a call to a non-inlined child and popping them after, so every error MUST snapshot its
path at push time. The fix is a cheaper snapshot and a cheaper pop, never an alias.

## What the code does today (verified)

- Generated fn: `function swxg_x(v,pth=[],er=[]){... nRT(pth,er,'string',['a']) ...}`. Signature from
  `ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go:20-26` + `walker.go:503`, error
  calls from `callRTErr` (`validationerrors.go:459-471`).
- The pure fn behind `nRT`, `_err` (`packages/run-types/src/runtypes/pure-fns-utils.ts:199-210`):
  `const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth]; εrr.push({expected, path});`
  Its id (`_rt:rXVwGkGDX0`) is a hash of its body: `pure-fn-ids.generated.ts` and
  `ts-go-runtypes/internal/cachegen/purefnids/ids.generated.go` regenerate on any edit.
- Static access paths are array literals built per error from walker frames (`AccessPathLiteral`,
  `emitter.go:216-225`): `['a']`, `[0,'createdAt']`, `[i0]`, `[k0]`, `{key:i0,failed:'mapKey'}` segments.
  They read loop vars (`i0`, `k0`), so they must stay evaluated at push time.
- Non-inlined child calls (named compounds, circular types, overrides): `emitPathTrackedDepCall`
  (`emitter.go:294-305`) emits `(pth.push('a',i0),X.fn(v.a[i0],pth,er),pth.splice(-2))`. Non-root format
  checks do the same (`wrapFormatCheckPath`, `validationerrors.go:186-195`). `splice(-N)` allocates a
  returned array on every call, valid input included.
- Format errors push inline with their own copy: `er.push({expected,path:[...pth],format:{…}})`
  (`formats/emit.go:9-22`, comment at :8 states the ownership intent).
- Circular guard (`rejectCircularRefs`, root only): `path: pth.length ? pth.concat(cyR) : cyR`
  (`validationerrors.go:30-33`); safe only because `findCycle` returns a fresh slice
  (`circular-pure-fns.ts:135-139`).
- patternProperties / propertyNames / contains run their child body on a fresh shadowed `pth=[]`
  (`validationerrors.go:77-179`); strict unknown keys add the key as a runtime segment
  (`unknownkeys_errors.go:11-20`); unions and template literals push one error at their own path.
- Public contract: `GetValidationErrorsFn(value, path?, errors?)` (`createRTFunctions.ts:120-124`) lets a
  caller pre-seed `path` / `errors`; no package passes either today (rpc-router dispatch, core headers,
  rpc-client, Standard Schema all pass the value only). Override fns receive `path` and store it as is
  (`test/suites/overrides/Interface.ts:17-21`).
- Consumers keep `err.path` BY REFERENCE: FriendlyText `groupByPath` (`enrich/createFriendlyText.ts`
  ~214) and Standard Schema issues (`standard/issueMapping.ts:62`). Nothing mutates a returned path.

## Traps

- Never alias the live `pth` in an error (e.g. `path: pth` when the static path is empty): the next
  `push` / `splice` rewrites it, and FriendlyText / Standard Schema would show the wrong path.
- A caller-supplied `path` must not end up inside an error: the walk mutates it in place, and a child
  that throws leaves it unbalanced.
- The static access literal is safe to hand over as the path ONLY when `pth` is empty: it is a fresh
  array per evaluation (its Map/Set `{key,failed}` objects too). Any other case needs one copy.
- `splice(-N)` with a static N relies on every child leaving `pth` balanced; a replacement must keep that.

## Direction

The implementer measures and decides; these are the levers. First micro-measurements (M ops/s, 3 rounds):
fail path, root object case: spreads today 9-15; `pth.concat(accessPath)` / `pth.slice()` 13-18; hand the
fresh static literal over when `pth.length === 0` 22-30; ajv 20-27. Happy path, recursive array: see Intent.

- `_err`: replace the two spreads with one non-spread copy, and skip the copy when `pth` is empty and
  a fresh static literal is given. Same for the inline `[...pth]` in format errors.
- Consider passing a single static segment as an argument instead of allocating a one-element array,
  if it measures better (needs the Go emitter and `_err` to agree).
- Happy path: replace `pth.splice(-N)` with `pth.pop()` (N pops for N segments; measure the N > 1
  forms): no allocation per non-inlined child call. `pth.length -= N` measured no better than splice.
  Same pattern in `wrapFormatCheckPath` and hoisted `ctxFn` helpers. Also check whether the default
  `pth=[]` / `er=[]` allocations can be avoided or deferred at the root without breaking the
  `(value, path?, errors?)` contract.
- Keep the caller-supplied `path` contract: either always copy at least once when `pth` came from the
  caller, or document that the root fast path only applies to the default `pth=[]`.
- Measure with the benchmark on several runs (the cloud CPU moves 10-30% run to run):
  `MION_VALIDATION_BENCH_CASE=<case> MION_VALIDATION_BENCH_TIME_MS=500 pnpm miondevx bench --one mion`
  over OBJECT.simple_interface, ARRAY.number_array, ARRAY.circular_array and other CIRCULAR cases (happy
  path), and REALWORLD, valid AND invalid streams, before and after.

## Tests

- Path values unchanged across the existing suites (`packages/run-types/test/suites/**`, the ~11 feature
  tests asserting `path: [`, `CircularGuard*.test.ts`).
- New: every error owns a distinct path array (no two errors share one; none is the caller's `path`);
  paths stay right after nested non-inlined calls (push/pop), in recursive and circular types, for
  Map/Set segments, strict unknown keys and format errors at a nested position; a caller-provided `path`
  is not mutated or aliased.
- Both `getRunTypeId` call shapes per the Marker test coverage rule (`ts-go-runtypes/AGENTS.md`).
- Update the Go tests that pin the emitted text (`collection_format_module_test.go`,
  `formats/structural/collectionformat_test.go`) and regenerate the pure-fn id files.

## Docs

None, because no path, error shape or API changes; only the cost of building them.

## Done when

- getValidationErrors is measurably faster on BOTH valid and invalid input on the benchmark cases above
  (recursive / circular cases for the happy path), every path value identical, the traps above covered by
  tests.
- The simplify-comments pass ran on every touched source file, committed on its own.

## What shipped

1. **`pop()` per segment** instead of `splice(-N)` after a non-inlined child call and around nested formats.
2. **One copy per error** in `_err`: `pth.slice()`, `pth.concat(accessPath)`, or the fresh static literal when
   `pth` is empty. Format errors use `pth.slice()`.
3. **An override child gets its own path copy** (`pth.concat([...])` / `pth.slice()`): user code may keep the
   array it is handed, and the live one keeps changing. Also broken before this change.

Tests: `test/features/validationErrorPaths.test.ts` (paths, path ownership, caller path, override, both shapes).

Official benchmark, MacBook, Node and Bun, 3 interleaved rounds, best round, average of 14 cases (M ops/s):

| Runtime, input | Before | Shipped | Shipped + pool + `false` result |
| --- | --- | --- | --- |
| Node, valid | 45.5 | 65.0 | 48.9 |
| Node, invalid | 21.6 | 31.6 | 31.4 |
| Bun, valid | 32.3 | 50.5 | 47.4 |
| Bun, invalid | 18.2 | 33.5 | 28.8 |

Tried and dropped: a root pool lending the path and errors lists, returning `false` for a valid value, and a
runtime wrapper doing both outside the generated fn. Together they were slower on every row but a tie on Node invalid (simple objects on
Node 143 -> 55), so none shipped. That code is commit `20b3600e4` in the pull request history.
