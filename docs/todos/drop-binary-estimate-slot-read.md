# Drop the `tb` slot read once `@ts-runtypes/core` exposes the binary size estimate

**Status:** todo — BLOCKED on an upstream change (tracked separately, to be implemented in
`@ts-runtypes/core` itself).
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
- `registerTypeFnTuple` decodes the value into its `record` but does not put it on the cache entry —
  and that is **by design, not an oversight**: `CompiledFnData` / `CompiledTypeFn` never declare
  `binarySizeEstimate`, while `FnTypeRecord` adds it *on top of* a `Pick<CompiledTypeFn, …>`, i.e.
  "on the wire tuple, not on the entry". So `getRT(rtFnHash)` cannot see it.
- `createBinarySizerFn` **is** exported but is the wrong tool: it computes an EXACT size by running a
  measure pass over a value, and takes `InjectTypeFnArgs<T, 'tb'>`, which the scanner requires at a
  literal call site (the same CTA003 constraint that forced `resolveCompiledPureFn`).

So mion reads tuple slot 11 directly, guarded and validated, in
`readBinarySizeEstimate` (`packages/core/src/runtypes/mionAdapter.ts`).

## What to do once upstream exposes it

Upstream needs `binarySizeEstimate` on the registered fn cache entry (see the companion ts-runtypes
task). When a release carries it:

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

## Done when

- mion reads the estimate through a supported upstream accessor; no tuple-slot indexing remains.
- The estimate is still asserted present for a real compiled route.
- Full suite + lint + format green, and the binary bench shows the same cold-start size as today
  (80 bytes on the bench route) — this must be a pure refactor.

## Worth weighing before doing it

The measured baseline showed upstream's WARM prediction was already tight, so the estimate mainly
buys **short-lived / serverless** processes where the size ring never fills. If upstream ever makes
this awkward, deleting mion's use of the estimate entirely is a legitimate outcome — the fallback is
exactly the behaviour mion had before the redesign.
