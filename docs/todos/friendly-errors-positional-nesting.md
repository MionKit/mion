# getFriendlyErrors nests field messages under the positional param index

**Status:** todo — found while adding the R20 friendly-errors canary.
**Created:** 2026-07-21

## Problem

Client-side param validation produces `RunTypeError`s whose paths are relative to the **positional
params tuple**, e.g. a bad `name` on a `route((ctx, user: UserWithFormats) => …)` call yields path
`[0, 'name']` (param index 0 → property). `getFriendlyErrors` (`packages/core/src/friendlyErrors.ts`)
skips the numeric index for HANDLER lookup (so a top-level `{name, age}` errorsMap still matches), but
`getOrCreatePath` places the RESULT message under that index — so the returned object is
`{ 0: { name: '…', age: '…' } }`, not `{ name: '…', age: '…' }`.

A consumer building a form for `UserWithFormats` naturally expects `friendly.name`, but must actually
read `friendly[0].name`. This is surprising and undocumented. Pinned (as current behavior) in
`packages/client/src/lib/friendlyErrors.spec.ts` ("pins the raw engine error shape …").

## Evidence

- `packages/run-types/src/mionAdapter.spec.ts` — param errors carry paths like `[0, 'name']`.
- `packages/core/src/friendlyErrors.ts` `getHandler` skips numeric segments (line ~332) but
  `getOrCreatePath` does not, so handler-lookup and result-placement disagree about the index.

## Fix plan (decide the intended contract first)

Option A — **single-object-param unwrap**: when a route has exactly one public param that is an
object, strip the leading `[0]` so the friendly result mirrors the object shape (`friendly.name`).
Keep the index for multi-param / tuple routes.

Option B — **document + helper**: keep the positional nesting (honest for multi-param routes) and
export a small `unwrapParam(friendly, 0)` helper + document that client param errors nest under the
param index.

Either way: add explicit specs for the single-object-param and multi-param cases, and update the
website server/validation docs. Prefer A if telemetry says single-object-param routes dominate.
