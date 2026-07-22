# Feasibility: replace mion getFriendlyErrors with @ts-runtypes createFriendlyText

**Status:** todo — Phase 8 gate of the proxy-removal wave (friendly-errors swap).
**Created:** 2026-07-22

## Verdict: REPLACEABLE-WITH-CAVEATS

`@ts-runtypes/core`'s `createFriendlyText` / `FriendlyText<T>` can replace mion's runtime
`getFriendlyErrors` / `FriendlyErrors<T>` (`packages/core/src/friendlyErrors.ts`,
`packages/core/src/types/formats/friendlyErrors.types.ts`) for **every structural addressing pattern**
(fields, nested objects, arrays, fixed tuples / positional params, Map key+value, Set items, root), and is
a strict **superset** on i18n, plural templates, and type-driven `$[val]` bound formatting (currency/date).

## What does NOT survive the port (caveats)

1. **Composed multi-constraint handlers → per-constraint list (biggest DX loss, not a blocker).**
   mion handlers read all aggregated failed constraints and compose ONE sentence
   (`Name must be at least ${f.minLength.val} and at most ${f.maxLength.val}`). `createFriendlyText` has no
   per-field callback: `rt$errors` per-constraint keys emit ONE message per violated constraint (a list),
   and `rt$default` is a single static template that cannot reference which bounds fired. Acceptable
   (arguably cleaner, translation-friendly) unless a product spec mandates the exact single-sentence phrasing.
2. **Nested-object output needs a role-aware shim (NOT a flat-array reduce).** mion returns
   `FriendlyErrorsResult<T>` — a nested object mirroring `T` with `$root` / `$keys` / `$values` / Set-index
   records. `createFriendlyText().errors()` returns a flat `FriendlyMessage[]` (`{path,label,message}`) whose
   `path` drops the Map key-vs-value role, so a `path.split('.')` reducer collides a Map's key error and value
   error at the same entry index. **Shim:** keep mion's role-aware `getOrCreatePath` reducer running over the
   raw `RTValidationError[]` and swap only the per-field message SOURCE from function-handlers to
   `createFriendlyText` template rendering (or extend `FriendlyMessage` to carry the segment role). Straightforward.
3. **Positional-params nesting** (`[0,'name']` on the client): author the map at the params-tuple level
   (`FriendlyText<[User]>` with `rt$slots`), not `FriendlyText<User>`. Resolves
   `docs/todos/friendly-errors-positional-nesting.md` by matching the map to the validated shape.
4. **Weaker no-template fallback + no console.warn nudge** (cosmetic — re-add mion's `defaultErrorPrinter`
   string if wanted), and **raw `expected`/`rtError` interpolation** in one spec (negligible edge).

## Runtime workflow is preserved
`createFriendlyText<T>(map)` is a pure function over any conforming `FriendlyText<T>` literal (the type is
exported from `@ts-runtypes/core`), so a client/app can hand-author the map inline and pass it at call time
exactly like today's `errorsMap`. The enrich CLI is an optional authoring aid, not required. The only hard
constraint: the map is declarative DATA, not functions (that is what forces caveat 1).

## Fix plan (Phase 8)
- Delete `getFriendlyErrors`/`defaultErrorPrinter` + `friendlyErrors.types.ts`; clean the orphaned format-param
  type mirror.
- Migrate `packages/client/src/lib/friendlyErrors.spec.ts`, the 5 `packages/examples/src/client/friendly-errors-*.ts`,
  `packages/test-server/src/test-server.ts`, and the website validation docs onto `createFriendlyText`.
- If any consumer needs the old nested shape, add the role-aware reducer shim (caveat 2).
- `git mv` this file + `friendly-errors-positional-nesting.md` into `docs/done/` when shipped.

## Related findings (see sibling todos)
- `friendlytext-rtdefault-duplicate-messages-upstream.md` — the `rt$default` "one per field" claim is not
  honored by the renderer (upstream `@ts-runtypes` bug), which weakens `rt$default` as the caveat-1 fallback.
- Engine error-shape token drift (`mapVal` vs `mapValue`, Set segment encoding) between the mion mirror and
  `@ts-runtypes` — harmless for a full swap (mion adopts `createGetValidationErrors` output natively), but a
  hard incompatibility for any incremental transition feeding one engine's errors to the other's renderer.
