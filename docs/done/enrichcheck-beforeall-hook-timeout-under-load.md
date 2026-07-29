---
type: fix
spec: full-plan
status: done
created: 2026-07-29
---

# enrichCheck beforeAll hook times out under full-suite CPU contention

**Status:** done — fixed via the first option: `hookTimeout: 30000` set alongside the
existing `testTimeout: 30000` in `packages/ts-runtypes/vitest.config.ts` (config-level, so
every sibling enrich category hook gets the same headroom). Reproduced once more during
the JSON Schema implementation session's baseline full-suite run before applying.
**Type:** fix — flaky test hook (load-dependent CI failure)
**Created:** 2026-07-29
**Found by:** the JSON Schema investigation's full-suite regression run (Claude Code web container)

## The flake

`packages/ts-runtypes/test/suites/enrich/enrichCheck.test.ts` runs `checkCategory(...)`
inside `beforeAll` (line ~26). Under a full `pnpm test` on a busy/containerized host, that
hook crossed vitest's default 10s `hookTimeout`:

```
FAIL |runtypes| test/suites/enrich/enrichCheck.test.ts > enrichment check — ATOMIC
Error: Hook timed out in 10000ms.
```

Isolated (`pnpm exec vitest run --project runtypes test/suites/enrich/enrichCheck.test.ts`)
the same suite passes 94/94 — the whole file takes ~18s of real work, so a 10s budget for
its heaviest hook has no headroom the moment other workers compete for CPU.

## Precedent / fix

The marker project's `vitest.config.ts` already raised `testTimeout` to 30s for exactly
this failure shape ("under the full suite's parallel CPU contention that occasionally
crossed vitest's tight 5s default"). The same reasoning applies to `hookTimeout`:

- either set `hookTimeout: 30000` alongside the existing `testTimeout: 30000` in
  `packages/ts-runtypes/vitest.config.ts`,
- or pass the timeout to this specific `beforeAll(fn, 30000)` if a scoped fix is preferred
  (there may be sibling category files in `test/suites/enrich/` with the same hook shape —
  apply to all of them).

No functional change involved; purely a budget alignment.
