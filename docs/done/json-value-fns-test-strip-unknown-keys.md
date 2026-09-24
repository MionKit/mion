---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Fix the run-types typecheck: a test still imports `createStripUnknownKeysFn`

## Intent

`pnpm run typecheck` fails on `main` (seen at `ea07f18`) in `@mionjs/run-types` `typecheck:test`:

```
test/suites/overrides/JsonValueFns.ts(8,3): error TS2724: '"@mionjs/run-types"' has no exported member named 'createStripUnknownKeysFn'. Did you mean 'createHasUnknownKeysFn'?
```

`createStripUnknownKeysFn` was removed from the public API, but this suite (added by the JSON override primitives fix) still imports and calls it. Two changes crossed on `main`. The vitest run may also fail on that import.

## Direction

The implementer plans the details. Verified pointers:

- `packages/run-types/test/suites/overrides/JsonValueFns.ts:8` (import) and `~:57-66` (the test `stringify and strip-unknown-keys compile for the overridden type`).
- The test's point is that a JSON override keeps the value-level JSON functions a caller asks for. Keep that coverage: drop the strip half, or point it at a public factory that still exercises the same family (the internal `stripUnknownKeysWire` family is still used by the `strip` JSON decoder), whichever keeps the test meaningful.
- Check nothing else in tests or examples still names `createStripUnknownKeysFn`.

## Docs

None, because only a test changes.

## Done when

- `pnpm run typecheck` and `pnpm test` pass.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-24, delegated session)

- A parallel fix on `main` already dropped the import and the strip half of the test. This change adds the strip coverage back through the public `createJsonDecoderFn<JsonValueParent>()`, whose default `strip` strategy runs the internal strip pass.
- The wire is the parent's JSON with an extra key at both levels. The test checks both extras come back `undefined` and the nested `id` is restored to a bigint.
- A JSON override only replaces the whole top-level string, so a nested overridden type travels in its plain JSON shape; the wire is built from `createStringifyJsonFn<JsonValueTarget>()` for that reason.
- No other test or example still names `createStripUnknownKeysFn`.
- Comment pass: ran, no edits needed, so there is no `chore(comments):` commit.
