---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Remove the stale `@mion-downgrade-error` comments in the run-types tests

## Intent

Every run of the `runtypes` vitest project (and the CI "js tests + lint" log) prints a wall of devtools warnings like:

```
warning DWN001: Unused `@mion-downgrade-error VL002`: nothing was reported on the line below it, so the comment is stale and can be deleted.
```

They drown real output, and a stale downgrade comment hides nothing now but would silently lower a future real error on that line. The output should be clean.

## Direction

- Known hits: `packages/run-types/test/suites/validation/Atomic.ts` lines 577, 583, 589, 594 (`VL002`) and 604, 610, 616 (`VE002`), and `packages/run-types/test/features/symbolLiteralWire.test.ts` line 45 (`VL002`). Collect the full list from a `pnpm exec vitest run --project runtypes` log, other projects too.
- Those hits sit over unique-symbol literal validators, which are now supported (matched by description), so the likely answer is plain deletion. For each hit, confirm that: if a diagnostic that SHOULD still fire has stopped, that is a resolver regression to fix, and the comment stays.
- Consider making DWN001 fail the test run (or a CI gate), so stale comments cannot pile up again.
- The implementer investigates and plans the details.

## Docs

None, because this only changes test comments (and possibly a test gate), nothing a consumer sees.

## Done when

- A full `pnpm test` run prints no DWN001 warning.
- Every removed comment was checked to be stale, not a regression.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-24), as shipped

- **Stale, not a regression.** All 10 hits sat over unique-symbol literals (`typeof sym` for `const sym = Symbol('hello')`). Those now validate by description, so VL002 / VE002 no longer fire there by design. Bare `symbol` and `symbol[]` still raise them, and their comments were not reported. `symbolLiteralWire.test.ts` asserts `isit(sym) === true`, and the Atomic suite runs every thunk.
- **Full list** (a `pnpm run test:ci` log and a whole-tree directive lint agreed, no other project had one): `Atomic.ts` lines 560, 565, 577, 583, 589, 594, 604, 610, 616, and `symbolLiteralWire.test.ts` line 45. All deleted.
- **Gate.** The lint plugin already has `runtypes/invalid-downgrade-error` and `runtypes/invalid-expect-error`, but `.oxlintrc.json` ignores `test/` and `examples/`. New `pnpm run lint:directives` (`scripts/core/lint-directives.mjs` + `scripts/core/oxlint-directives.json`) runs just those two rules at `error` on the tracked `packages/*.ts` files that carry a directive (about 6 s; the whole tree took 2.5 min). It is part of `pnpm run lint`, so CI's `js tests + lint` job runs it. Checked: exit 1 on the old tree, 0 after the fix.
- **Test.** `repo-contracts.test.ts` checks the file list reaches the test and example files and nothing built, and that the config names only rules the plugin defines.
- **Docs.** None, nothing a consumer sees.
