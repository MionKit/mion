# De-wrapper @mionjs/core's remaining @ts-runtypes proxies

**Status:** partially — the pure type mirrors are done; the DataView **runtime adapter** is
DEFERRED (it is not a pure re-export and touches public API + JIT-hardcoded names).
**Created:** 2026-07-22
**Updated:** 2026-07-23 (PR #128 Track A)

## Done (PR #128)

- **`RunTypeError` → `RTValidationError`** (commit `2cc504e`). mion's `RunTypeError` +
  `PathSegment`/`MapKey`/`MapValue`/`SetItem` segments + its `TypeFormatError` were inaccurate
  mirrors (the validators emit `RTValidationError`; mion only forwards them). Aliased to
  `@ts-runtypes/core`'s `RTValidationError`; `TypeFormatError` re-exported from `@ts-runtypes/core`.
- **`DataOnly` → `@ts-runtypes/core`** (commit `9e808c8`). mion's hand-rolled projection was used
  internally only by `DeserializeClassFn`/`AnyClass`/`SerializableClass` (all orphaned when the
  jitUtils class registries were deleted). Aliased to `@ts-runtypes/core`'s `DataOnly`.

## Deferred — `src/binary/dataView.ts` + the DataView types (NOT a pure re-export)

Investigation during Track A found this is **not** a mechanical mirror swap:

1. **The DataView types are an ADAPTED shape, not a mirror.** mion's `DataViewSerializer`
   (`src/types/general.types.ts`) is `{index, view, reset, …}`; `@ts-runtypes/core`'s is
   `{buffer, cacheKey, index, view, hasEnded, …}`. They differ, so `export type … from
   '@ts-runtypes/core'` would change the shape the framing code relies on.
2. **The names are hardcoded in JIT-generated code.** `general.types.ts` warns:
   *"DO NOT CHANGE THE INTERFACE NAMES AS THEY ARE HARDCODED IN THE JIT GENERATED CODE"*
   (`DataViewSerializer`/`DataViewDeserializer`). Any rename/move must preserve the exact names.
3. **`dataView.ts` is a runtime option/signature adapter.** It maps mion option names →
   ts-runtypes names (`bufferSize`→`defaultBufferSize`, `averageResponseSizeMultiplier`→
   `sizeMultiplier`, …) and `createDataViewSerializer(routeId, workflowRouteIds?)` →
   `rtCreateDataViewSerializer(routeId, {relatedKeys})`. Removing it relocates that adaptation into
   `bodySerializer.ts`/`bodyDeserializer.ts`.
4. **Public surface decision.** `setSerializationOptions`/`SerializationOptions` are exported with
   **no in-repo consumer** — decide deliberately whether to drop them or keep one mapping helper.

### Fix plan (when tackled)
- Reconcile mion's `DataViewSerializer`/`DataViewDeserializer` shape with `@ts-runtypes/core`'s (or
  keep a mion-owned adapter type if the `reset()`-style framing is genuinely mion-specific).
- Have `bodySerializer.ts`/`bodyDeserializer.ts` import the codec from `@ts-runtypes/core` and pass
  the ts-runtypes option/signature shape at the call site; delete `src/binary/dataView.ts` and its
  `export *` from `core/index.ts`.
- Repoint `router/src/routes/serializer.binary.spec.ts` to import `createDataViewDeserializer` from
  `@ts-runtypes/core`.
- Settle `setSerializationOptions`/`SerializationOptions` (drop vs keep a single mapping helper).

Best done together with the Track B `CompiledFnData`/`CompiledTypeFn` adoption (blocked on the
upstream export — ts-runtypes `docs/todos/export-compiled-fn-structs-and-reconstruction-api.md`).
