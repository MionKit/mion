# Adopt @ts-runtypes/devtools/eslint and reconcile overlapping mion lint rules

**Status:** done — the plugin is wired in and green across all 13 projects.
**Created:** 2026-07-22
**Updated:** 2026-07-27 (split out of the retired docs/partially/; residual tuning + docs work
moved to [../todos/eslint-rules-tuning-and-docs.md](../todos/eslint-rules-tuning-and-docs.md))

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

## Follow-ups (moved, not dropped)

Severity tuning, the duplicate CLS001 emission, the `no-type-imports` / `enforce-type-imports`
re-evaluation, and the website rule-set doc are tracked in
[../todos/eslint-rules-tuning-and-docs.md](../todos/eslint-rules-tuning-and-docs.md). The stale
example fixtures for the removed `type-formats-imports` rule are tracked with the rest of the
website/examples drift in
[../todos/website-stale-package-references.md](../todos/website-stale-package-references.md).

## Context

`@ts-runtypes/devtools` ships an ESLint/OXlint plugin on its `./eslint` (and `./oxlint`) subpaths
— a transport over the Go resolver that emits marker / validate / json / binary / format /
non-enumerable / pure-functions diagnostics. mion's own `@mionjs/devtools/eslint` plugin has some
overlapping rules plus mion-specific ones.

The obsolete `type-formats-imports` rule (and its `formatTypeNames.ts` helper + spec) was already
removed, and `PURE_FN_SOURCE_PACKAGES` was repointed to `@mionjs/core`. What remains is the
opt-in adoption of the upstream plugin, which is NOT a mechanical change.

