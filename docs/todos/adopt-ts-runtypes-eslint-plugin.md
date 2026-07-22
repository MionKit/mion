# Adopt @ts-runtypes/devtools/eslint and reconcile overlapping mion lint rules

**Status:** todo — deferred from the proxy-removal wave (Phase 5). Not safe to wire inline
without triage (would surface new resolver diagnostics over all mion source).
**Created:** 2026-07-22

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
