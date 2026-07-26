# De-wrapper @mionjs/core's remaining @ts-runtypes proxies

**Status:** partially — every TYPE mirror is gone; ONE deliberate public-API surface remains
(`setSerializationOptions` / the DataView creation signatures), pending an explicit decision.
**Created:** 2026-07-22
**Updated:** 2026-07-26 (PR #128, after the @ts-runtypes 0.11.0 upgrade)

## Done

Landed against **@ts-runtypes 0.11.0**, which exported the pieces mion was mirroring:

- **`RunTypeError` → `RTValidationError`** (`2cc504e`) + `TypeFormatError` re-exported.
- **`DataOnly` → `@ts-runtypes/core`** (`9e808c8`); the hand-rolled projection + its `Native`
  helper deleted.
- **`FormatNames` → `typeFormats`** (`c9c8566`). Upstream now ships generated format-name
  constants; the mion const was a strict-subset mirror. The three drizzle mappers key off
  `typeFormats.<name>.name` imported straight from `@ts-runtypes/core`.
- **`MionCompiledPureFn` → `CompiledPureFunction`** (`418bdb1`).
- **`JitCompiledFnData` / `JitCompiledFn` → `CompiledFnData` / `CompiledTypeFn`** (`6fc614b`),
  with the field renames at every consumer (`jitFnHash`→`rtFnHash`, `jitDependencies`→
  `rtDependencies`, `createJitFn`→`createRTFn`) and the **`RtCacheEntry` mirror in
  `rtResolver.ts` deleted** (`getRtEntry` now returns upstream's type straight from `getRT()`).
- **DataView types** (`StrictArrayBuffer`, `BinaryInput`, `DataViewSerializer`,
  `DataViewDeserializer`) → re-exported from `@ts-runtypes/core` under the SAME names (they are
  hardcoded in JIT-generated code). Re-checked against 0.11.0: every member mion declared exists
  upstream verbatim, so these were strict subsets — the earlier "the shapes differ" finding was
  true of 0.10.0 only. The now-redundant `as unknown as` casts in `binary/dataView.ts` are gone.

## What remains — a deliberate API decision, not a mirror

`src/binary/dataView.ts` still holds mion's **own** option-name + creation-signature surface:

- `SerializationOptions` maps mion names onto ts-runtypes ones (`bufferSize`→`defaultBufferSize`,
  `averageResponseSizeMultiplier`→`sizeMultiplier`, …) via `setSerializationOptions`.
  **Neither is consumed anywhere in-repo** — it is public API only.
- `createDataViewSerializer(routeId, workflowRouteIds?)` adapts to
  `rtCreateDataViewSerializer(routeId, {relatedKeys})`.
- `createDataViewDeserializer` is now a pure pass-through.

### Fix plan (needs a call)
1. Decide whether `setSerializationOptions` / `SerializationOptions` stay public. If not, delete
   them and let consumers use `@ts-runtypes/core`'s `setSerializationOptions` with its own names.
2. If they go: move the `{relatedKeys: workflowRouteIds}` adaptation into
   `bodySerializer.ts`/`bodyDeserializer.ts` at the call site, drop `createDataViewDeserializer`
   (pass-through), delete `src/binary/dataView.ts` and its `export *` from `core/index.ts`, and
   repoint `router/src/routes/serializer.binary.spec.ts` at `@ts-runtypes/core`.
3. If they stay: keep the module but document it as mion's intentional binary-serialization API
   (already noted in its header comment), and close this spec.
