---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# JSON override test imports a removed export, main fails typecheck

## The problem

On `main` (e290a98), `pnpm run typecheck` fails in `@mionjs/run-types`:

```
test/suites/overrides/JsonValueFns.ts(8,3): error TS2724: '"@mionjs/run-types"' has no exported member named 'createStripUnknownKeysFn'. Did you mean 'createHasUnknownKeysFn'?
```

`packages/run-types/test/suites/overrides/JsonValueFns.ts` (added by 9afb345) imports and calls `createStripUnknownKeysFn` (lines 8 and 62). That export no longer exists: 90a4af3 folded unknown-key removal into `createRemoveUnknownKeysFn` (a deep clone of the declared shape). The test was written against the old API, and since `pnpm run lint` runs typecheck, lint is red on main too.

## Direction

- Find what the line-62 case meant to pin (a JSON override still yields a value-level JSON function by name) and point it at the current export that does that job, most likely `createRemoveUnknownKeysFn` or dropping the case if that function is not a JSON value-level function any more.
- Check the vitest run of the file still passes, and that nothing else in the tree names `createStripUnknownKeysFn`.

## Done when

- `pnpm run typecheck` and `pnpm run lint` pass on the fix branch.
- `pnpm exec vitest run packages/run-types/test/suites/overrides` passes.

## Plan (approved 2026-09-24, as shipped)

- The line-62 case pinned "unknown-key removal still compiles for a type with a JSON override". `createRemoveUnknownKeysFn` is that job now; it works on the runtime value, not the wire form.
- The case now feeds `{...target(), extra: 1}` and expects `target()` back, so the bigint and Date also survive the clone.
- No other file named `createStripUnknownKeysFn`. No docs change: test-only fix.
