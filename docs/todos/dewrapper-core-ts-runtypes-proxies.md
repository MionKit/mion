# De-wrapper @mionjs/core's remaining @ts-runtypes proxies

**Status:** todo — deferred from the proxy-removal wave (commit ffeeeb3). Not simple in
isolation; the type-mirror half is entangled with the pending friendly-errors swap.
**Created:** 2026-07-22

## Goal

After deleting `@mionjs/run-types` + `@mionjs/type-formats`, the only `@ts-runtypes` couplings
left in `@mionjs/core` are two internal wrappers. The maintainer wants no mion wrapper of
`@ts-runtypes` functionality to survive (devtools excepted). These are deferred because they are
NOT pure re-exports and one half is coupled to friendly errors.

## 1. `src/binary/dataView.ts` — binary DataView adapter (NOT a pure re-export)

It wraps `@ts-runtypes/core`'s `createDataViewSerializer`/`createDataViewDeserializer`/
`setSerializationOptions` with:
- mion option names → ts-runtypes names (`bufferSize`→`defaultBufferSize`,
  `averageResponseSizeMultiplier`→`sizeMultiplier`, …) via the `SerializationOptions` interface +
  `setSerializationOptions`.
- mion signature `createDataViewSerializer(routeId, workflowRouteIds?)` →
  `rtCreateDataViewSerializer(routeId, {relatedKeys})`.

Consumers: `src/binary/bodySerializer.ts`, `src/binary/bodyDeserializer.ts` (core framing),
`packages/router/src/routes/serializer.binary.spec.ts` (uses `createDataViewDeserializer` via
`@mionjs/core`). `setSerializationOptions`/`SerializationOptions` are exported but have **no
in-repo consumer** (public-API surface only).

### Fix plan
- Have `bodySerializer.ts`/`bodyDeserializer.ts` import the codec directly from `@ts-runtypes/core`
  and pass the ts-runtypes shape (`{relatedKeys: workflowRouteIds}`) at the call site.
- Decide `setSerializationOptions`/`SerializationOptions`: either drop (if the public API isn't
  needed) or keep a single mapping helper — do NOT keep a whole module just for it.
- Repoint the router binary spec to import `createDataViewDeserializer` from `@ts-runtypes/core`
  (signature already matches `(routeId, ArrayBuffer)`).
- Delete `src/binary/dataView.ts`; remove its `export *` from `core/index.ts`.

## 2. Type mirrors in `src/types/general.types.ts` — do this WITH friendly errors (Phase 8)

mion re-declares types that `@ts-runtypes/core` already exports:
- **Pure-ish mirrors** (candidates to re-export from `@ts-runtypes/core`): `DataOnly<T>` (L309),
  `BinaryInput` (L362), `StrictArrayBuffer` (L360), `DataViewSerializer` (L363),
  `DataViewDeserializer` (L378). Verify each matches the `@ts-runtypes/core` shape before
  swapping `export interface/type …` → `export {…} from '@ts-runtypes/core'`.
- **`RunTypeError` (L118)** — mion's own error interface, used pervasively (friendlyErrors, client,
  router). It mirrors `@ts-runtypes`' `RTValidationError`. Replacing it is entangled with the
  friendly-errors swap (that phase already migrates error rendering to `createFriendlyText`, which
  consumes `RTValidationError`). **Do the `RunTypeError` → `RTValidationError` migration as part of
  Phase 8**, not in isolation.
- The format-param type mirror (`src/types/formats/{formats.types,formatsParams.types}.ts`) is
  likewise cleaned up in Phase 8 when `friendlyErrors.types.ts` (its only consumer) is deleted.

## Why deferred (not a leftover to force now)
- `dataView.ts` removal is contained but low-value: it just relocates the option/signature
  adaptation into the framing modules. Worth doing, but not urgent, and it touches the public
  `setSerializationOptions` surface — decide that deliberately.
- The type-mirror removal ripples across friendlyErrors/client/router via `RunTypeError` and is
  best folded into the friendly-errors swap so the two changes reconcile in one pass rather than
  churning `RunTypeError` twice.
