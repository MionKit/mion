---
type: fix
spec: guidelines
status: ready
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
