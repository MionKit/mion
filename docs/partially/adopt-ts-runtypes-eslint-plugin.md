# Adopt @ts-runtypes/devtools/eslint and reconcile overlapping mion lint rules

**Status:** partially done — the plugin is WIRED IN and green; residual doc/fixture/tuning items
below are deferred to the examples/website refresh.
**Created:** 2026-07-22

## What shipped (PR #128)

- `@ts-runtypes/devtools/eslint`'s `configs.recommended` (24 `runtypes/*` resolver-backed rules) is
  added to `eslint.config.js`. Verified: full `pnpm run lint` = **0 errors** across all 13 projects
  (only advisory warnings, mostly `runtypes/class-serializer` [CLS001] + pre-existing unused-vars).
  The rules spawn the Go resolver at lint time (same binary the vite plugin already uses), so lint
  now gives the marker/validate/json/binary/format diagnostics at lint time, not just at build.
- Removed the stale `packages/run-types/microbenchs/**` ignore.
- **Triage result: no mion rules dropped.** After comparison the adoption is ADDITIVE, not a swap:
  mion's `pure-functions` rule covers the mion RUNTIME pure-fn lane (`registerMionPureFn`), which the
  upstream marker-based `runtypes/pure-functions` rule does not scan; `strong-typed-routes`,
  `no-vite-client`, `no-unreachable-union-types`, `no-mixed-union-properties`, `no-type-imports`,
  `enforce-type-imports` are all mion-specific with no upstream equivalent. (The one genuinely
  obsolete rule, `type-formats-imports`, was already removed in Phase 5.)

## Deferred (rides examples/website refresh)

- **Severity tuning** — recommended keeps several rules at `error` (invalid-marker,
  validate/json/binary-non-serializable, format, non-enumerable, …). They are green on today's code;
  revisit whether any should be `warn` for the first release, and quiet the duplicate `CLS001`
  emission (each fires twice — cosmetic, likely an upstream double-report).
- **`no-type-imports` / `enforce-type-imports` re-evaluation** — decide if these deepkit-era rules
  are still needed under `@ts-runtypes` build-time resolution (an `import type` of a marker/format
  type may be fine now). Left ON pending that call.
- **Example fixtures** for the removed `type-formats-imports` rule
  (`packages/examples/src/introduction/eslint-type-formats-imports-{valid,invalid}.routes.ts`,
  `packages/router/examples/eslint-rule-test.routes.ts`) — delete/repoint in the refresh.
- **Website `5.devtools/2.eslint-rules.md`** — document the combined rule set (mion + `runtypes/*`).

## Context

`@ts-runtypes/devtools` ships an ESLint/OXlint plugin on its `./eslint` (and `./oxlint`) subpaths
— a transport over the Go resolver that emits marker / validate / json / binary / format /
non-enumerable / pure-functions diagnostics. mion's own `@mionjs/devtools/eslint` plugin has some
overlapping rules plus mion-specific ones.

The obsolete `type-formats-imports` rule (and its `formatTypeNames.ts` helper + spec) was already
removed, and `PURE_FN_SOURCE_PACKAGES` was repointed to `@mionjs/core`. What remains is the
opt-in adoption of the upstream plugin, which is NOT a mechanical change.

## Why deferred

Wiring `@ts-runtypes/devtools/eslint` into `eslint.config.js` makes eslint spawn the Go resolver
over all mion source and emit its full diagnostic set (the CLS001/VL0xx/etc. warnings currently
seen only during the vite build). That can turn mion's currently-green `pnpm run lint` red and
needs deliberate config (`settings.runtypes.timeoutMs`, tsconfig wiring, severity choices) — not
a safe inline edit.

## Fix plan

1. Add `@ts-runtypes/devtools/eslint` to `eslint.config.js` with an explicit severity policy
   (start most rules at `warn`, promote to `error` deliberately).
2. Triage overlap and drop mion rules now covered upstream:
   - `pure-functions` — compare mion's registerMionPureFn/serverMapFrom purity check vs the
     upstream `pure-functions` rule; keep only the mion-specific gap.
   - `no-type-imports` / `enforce-type-imports` — re-evaluate whether they are still needed under
     `@ts-runtypes` build-time resolution (they were deepkit-era; `import type` of a marker/format
     type may be fine now). Keep only if a real failure mode remains.
3. Keep mion-only rules with no upstream equivalent: `strong-typed-routes`, `no-vite-client`,
   `no-unreachable-union-types`, `no-mixed-union-properties`.
4. Update the two example fixtures that only existed for the removed `type-formats-imports` rule
   (`packages/examples/src/introduction/eslint-type-formats-imports-{valid,invalid}.routes.ts`,
   `packages/router/examples/eslint-rule-test.routes.ts`) — delete or repoint as part of the
   examples/website refresh.
5. Reconcile the website `5.devtools/2.eslint-rules.md` doc with the final rule set.
