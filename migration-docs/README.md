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

## Version/dependency status (2026-07-15: @ts-runtypes 0.9.2)

- mion consumes **`@ts-runtypes/{core,devtools,bin}@0.9.2` from npm** (0.9.2 ships the upstream follow-ups this migration filed: enumerability guard + `@nonEnumerable`, generic class serializers, tuple-labels-in-id, pattern-message-as-error-val, definition-time mockSample validation, JCP001). Every bump re-hashes all family fn-hashes, so `JIT_FUNCTION_IDS` is refreshed per version and pinned by the run-types adapter spec. The platform resolver binary installs via `@ts-runtypes/bin`'s `@ts-runtypes/binary-<os>-<arch>` optional deps — no local checkout or explicit `binary` path needed (the `TS_RUNTYPES_BIN` env var remains a dev convenience). See [04-progress-log.md](04-progress-log.md) (2026-07-15) for the full adoption notes, including the open RpcError name/message wire-shape decision.
- The interim `vendor/ts-runtypes/` tarballs and the `.gitignore` `!vendor` exception were removed with the swap.
- `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` covers `unplugin` (published 2026-06-29) and `@ts-runtypes/*` (published 2026-07-11) until they age past the 30-day policy — remove the entries then.
