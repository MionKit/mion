# Drop the `tb` slot read once `@ts-runtypes/core` exposes the binary size estimate

**Status:** todo — UNBLOCKED upstream and **DRY-RUN VERIFIED** (2026-08-21). Waiting on a release
only. The current slot read is safe, tested and staying until `@ts-runtypes/core` ships the field.
**Type:** cleanup
**Spec:** full-plan
**Created:** 2026-08-20

Follow-up to [../done/binary-buffer-strategy-redesign.md](../done/binary-buffer-strategy-redesign.md).
The binary lane is **finished and shipped**; this is a cleanliness win only, with no behaviour change.

## Why this exists

mion sizes a cold binary buffer from the compile-time per-type estimate the plugin bakes into the
`tb` entry tuple (a `number` return estimates 8 bytes, a small object ~35, a nested one ~2.8 KiB —
versus a flat 16 KiB default). Upstream offers no supported way to read it:

- `binarySizeEstimateFromTuple` lives in `runtypes/entryTuple`, which is not in the package's
  `exports` map.
- `registerTypeFnTuple` decodes the value into its `record` but does not put it on the cache entry,
  so `getRT(rtFnHash)` cannot see it. This was read as deliberate (`FnTypeRecord` adds the field *on
  top of* a `Pick<CompiledTypeFn, …>`, i.e. "wire tuple, not entry"); upstream has since confirmed
  it was simply not copied through, and fixed it — see below.
- `createBinarySizerFn` **is** exported but is the wrong tool: it computes an EXACT size by running a
  measure pass over a value, and takes `InjectTypeFnArgs<T, 'tb'>`, which the scanner requires at a
  literal call site (the same CTA003 constraint that forced `resolveCompiledPureFn`).

So mion reads tuple slot 11 directly, guarded and validated, in
`readBinarySizeEstimate` (`packages/core/src/runtypes/mionAdapter.ts`).

## Upstream has landed it (unreleased)

`binarySizeEstimate` is now declared on `CompiledFnData` and copied onto the entry in
`registerTypeFnTuple`, so `getRTUtils().getRT(rtFnHash).binarySizeEstimate` works. Branch
`feature/devtools-bun-lane-and-diagnostics` in `ts-run-types`.

Two things that were true when this spec was written and are worth correcting:

- The omission was read here as deliberate (`FnTypeRecord` adding the field *on top of* a
  `Pick<CompiledTypeFn, …>`, i.e. "wire tuple, not entry"). It was not: the record already decoded
  the value and the entry builder simply did not copy it through.
- `createRTFBinary` deliberately keeps reading the TUPLE rather than the entry, so nothing about
  mion's current slot read is at risk from the change. The tuple layout is unchanged and
  `binarySizeEstimate` is still slot 11.

## What to do once a release carries it

1. **`packages/core/src/runtypes/mionAdapter.ts`** — delete `readBinarySizeEstimate` and the
   `TB_TUPLE_LENGTH` / `TB_ESTIMATE_SLOT` / `MAX_BUFFER_BYTES` constants. Populate the reflection
   from the entry mion already resolves in `buildJitFnsFromMarker`:

   ```ts
   // toBinaryEntry is already fetched there via utl.getRT(hashes.toBinary)
   paramsBinarySizeEstimate: paramsJitFns.toBinary?.binarySizeEstimate,
   returnBinarySizeEstimate: returnJitFns.toBinary?.binarySizeEstimate,
   ```

2. **`packages/core/src/runtypes/mionAdapter.spec.ts`** — delete the two tripwire tests
   (`reads the compile-time binary size estimate off the tb tuple` and
   `degrades to undefined (never throws) when no usable estimate is present`). Replace with one test
   asserting the estimate arrives on the reflection from a real compiled route. **Keep an assertion
   that it is DEFINED and plausible** — a supported accessor still returns `undefined` if the field
   stops being populated, and the failure mode stays silent (cold buffers quietly revert to
   `MIN_COLD_START_BYTES`, no test fails).

3. Bump `@ts-runtypes/core` in `packages/core/package.json` to the release that carries it.

4. Nothing else changes: `coldStartSize` in `packages/core/src/binary/bodySerializer.ts` already
   consumes `paramsBinarySizeEstimate` / `returnBinarySizeEstimate` off `MethodWithJitFns` and does
   not care where they came from.


## Dry-run result (2026-08-21) — the plan below is CORRECT as written

Applied against a locally packed upstream build (recipe in
[platform-bun-adopt-upstream-adapter.md](platform-bun-adopt-upstream-adapter.md)) and reverted
afterwards. Steps 1, 2 and 4 worked verbatim; step 3 (the version bump) is the only part that
cannot be done until the release.

**It is a pure refactor, measured rather than assumed.** The same route reports the same bytes
through both paths:

| | params | return |
| --- | --- | --- |
| old (tuple slot 11) | 58 | 35 |
| new (`toBinary?.binarySizeEstimate`) | 58 | 35 |

One detail worth knowing before you start: `buildJitFnsFromMarker` already resolves the entry
and exposes it as `jitFns.toBinary`, so the two `buildJitFnsFromMarker(...)` calls in
`getReflectionFromMarkers` need hoisting into locals first, then the estimates read off those.
No other call-site change.

Full suite green with the refactor applied (700 vitest + 12 bun, lint clean).

## Done when

- mion reads the estimate through a supported upstream accessor; no tuple-slot indexing remains.
- The estimate is still asserted present for a real compiled route.
- Full suite + lint + format green, and the binary bench shows the same cold-start size as today
  (80 bytes on the bench route) — this must be a pure refactor.

## Direction: reading the caches is the sanctioned approach

There was a parallel idea to have upstream emit build-time metadata alongside each compiled fn, so
mion could stop reading the runtype caches at all. **That was withdrawn on 2026-08-20** — the caches
turned out to be used extensively across mion, so replacing that channel is not worth the cost.

`getRunType()` graph reads and entry-tuple reads are therefore the accepted way for mion to get
build-time type facts, not a stopgap. That materially lowers the value of this spec: it is no longer
"escape an unsupported hack", only "prefer a named field over a positional slot".

What still argues for doing it: this read indexes tuple **slot 11 by position**, whereas mion's other
cache reads (`getRunType()` walks, `getRT()` entries) go by property NAME. Position is the fragile
subcase — a reordered tuple silently returns the wrong number or nothing, which is exactly why the
tripwire test exists. A named field on the entry removes that specific hazard without changing the
"mion reads the caches" posture at all.

## Worth weighing before doing it

The measured baseline showed upstream's WARM prediction was already tight, so the estimate mainly
buys **short-lived / serverless** processes where the size ring never fills. If upstream ever makes
this awkward, deleting mion's use of the estimate entirely is a legitimate outcome — the fallback is
exactly the behaviour mion had before the redesign.
