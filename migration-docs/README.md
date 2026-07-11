# mion → ts-runtypes migration (spike)

Goal: replace `@mionjs/run-types` (runtime JIT type system) and the AOT cache-generation machinery in `@mionjs/devtools` with the new published **`@ts-runtypes/*`** packages (fully precompiled, vite-plugin driven), keeping changes to `@mionjs/router` as small as possible.

Target end state of this spike: a **semi-working devtools + router** — at least one basic route registers, validates its params and serializes its response through `@ts-runtypes/core` compiled functions.

## Documents

| Doc | Content |
| --- | --- |
| [01-ts-runtypes-api.md](01-ts-runtypes-api.md) | What the new packages provide (markers, factories, fn keys, vite plugin) |
| [02-current-mion-architecture.md](02-current-mion-architecture.md) | How mion works today: run-types consumers, devtools pipeline, router dispatch |
| [03-migration-plan.md](03-migration-plan.md) | The plan: proxy strategy, router adaptation, phases |
| [04-progress-log.md](04-progress-log.md) | Dated log of work done, issues found, decisions taken |

## Key constraints (from the maintainer)

- mion adapts to ts-runtypes, not the other way round — only touch ts-run-types for actual bugs/gaps.
- As little modification to `@mionjs/router` as possible; `@mionjs/run-types` becomes a proxy over `@ts-runtypes/core`.
- `@ts-runtypes/*` is published as 0.9.0; mion publishes as 0.9 once migrated.

## Version/dependency status (2026-07-11)

- npm has `@ts-runtypes/{core,devtools,bin}@0.9.0` + 7 platform binary packages (published 2026-07-10).
- **The published 0.9.0 predates the `getRTFunction` API** (`feat/refactor(marker)` commits `a1c7f1d`, `eb7b618` on ts-run-types `main`) that this migration is built on. Until a `0.9.1` is published, mion consumes **locally packed tarballs** built from ts-run-types `main` → committed under [`vendor/ts-runtypes/`](../vendor/ts-runtypes/) (~210 KB total).
- The resolver **binary** is NOT vendored (32 MB). `@ts-runtypes/bin`'s platform optional-deps are only injected at publish time, so in this repo the vite plugin gets an explicit `binary` path: `TS_RUNTYPES_BIN` env var, falling back to the sibling checkout `../ts-run-types/bin/ts-runtypes`.
- mion's `minimumReleaseAge: 43200` (30 days) blocks `unplugin@3.3.0` (dep of `@ts-runtypes/devtools`, published 2026-06-29) → excluded in `pnpm-workspace.yaml`.

## After @ts-runtypes 0.9.1 is published

1. Delete `vendor/ts-runtypes/` and swap the three `file:` specifiers for registry versions (add `@ts-runtypes/*` to `minimumReleaseAgeExclude` until they age 30 days).
2. Drop the explicit `binary` path plumbing — `@ts-runtypes/bin`'s `getExePath()` resolves the platform package automatically.
