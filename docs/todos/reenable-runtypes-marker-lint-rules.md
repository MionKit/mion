# Re-enable @ts-runtypes marker lint rules after the resolver customConditions fix

**Status:** todo — blocked on an upstream `@ts-runtypes` release
**Created:** 2026-07-22

## Evidence

Adopting `@ts-runtypes/devtools/eslint` (recommended config) added `runtypes/invalid-marker`
(MKR007) at **error** severity. On a **cold** run (no build, no Nx task cache, no
`node_modules/.cache/ts-runtypes`) `pnpm run lint` fails with **59 MKR007 errors** in:

- `packages/router/src/lib/headers.spec.ts`
- `packages/router/src/routes/client.routes.spec.ts`

all reading `[MKR007] Marker type resolved to 'any' because this file has an unresolved
import ('@mionjs/core')`. This is what broke PR #128's CI (the `Lint` step; `--nx-bail`
then aborts the rest, exit 130 — the `Test` step never runs).

### Root cause is upstream, not a mion defect

The `@ts-runtypes` ESLint lint surface spawns the resolver in **inline-server mode**, which
builds an inferred program (`program.NewInferred`) that **ignores the tsconfig's
`customConditions: ["source"]` (and `paths`)**. mion resolves workspace packages from source
via that condition (no per-package build in dev/CI), so `@mionjs/core` resolves to `any` and
the marker collapses. The **build/test path** (`program.New`, invoked with a tsconfig) honors
`customConditions` and resolves the same types correctly — `pnpm exec vitest run --project
router packages/router/src/lib/headers.spec.ts` passes 25/25 cold. So the validators are
correct at build/test time; only the lint resolver is blind to source-only workspace types.

Upstream tracking: `ts-run-types` → `docs/todos/eslint-inline-server-honor-customconditions.md`.

Locally the failure is masked by the **Nx task cache** (`.nx/cache` replays a previous
successful `router:lint`) and the ts-runtypes **disk cache** (warmed by the source-honoring
test path). CI runs cold with neither, so it fails. Reproduce locally with:
`pnpm exec nx reset && find . -type d -path '*/node_modules/.cache/ts-runtypes' -prune -exec rm -rf {} + && rm -rf packages/*/.dist && pnpm run lint`.

## Interim (shipped in this PR)

`eslint.config.js` disables the two resolver-dependent marker rules (both are symptoms of the
same `any`-collapse):

```js
'runtypes/invalid-marker': 'off',
'runtypes/validate-skipped-member': 'off',
```

The other `@ts-runtypes` rules stay on (`class-serializer`, format-import hygiene, etc.) — they
work on the AST and do not depend on cross-package type resolution.

## Fix plan (after the upstream fix is released)

1. Bump `@ts-runtypes/core`, `@ts-runtypes/devtools`, `@ts-runtypes/bin` to the version that
   contains the inline-server `customConditions` fix (mind pnpm `minimumReleaseAge` /
   `minimumReleaseAgeExclude`).
2. Delete the two `'off'` overrides in `eslint.config.js` so the rules return to their
   recommended severity (`invalid-marker` → error).
3. Verify **cold**: `pnpm exec nx reset`, clear `node_modules/.cache/ts-runtypes`, remove any
   `packages/*/.dist`, then `pnpm run lint` → **0 errors** (router specs validating
   `@mionjs/core` resolve to real types, not `any`).
4. `git mv` this spec into `docs/done/` and note the commit/PR.
