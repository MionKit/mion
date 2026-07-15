# mion → ts-runtypes migration

Goal (achieved): replace `@mionjs/run-types` (runtime JIT type system) and the AOT
cache-generation machinery in `@mionjs/devtools` with the published **`@ts-runtypes/*`**
packages (fully precompiled, vite-plugin driven), keeping changes to `@mionjs/router` as small
as possible.

**Status: COMPLETE.** The whole monorepo builds and tests green on `@ts-runtypes/*@0.9.2`
(PR #123). What remains are discrete, non-blocking follow-ups tracked under
[`todos/`](todos/) (see below).

## Documents

| Doc | Content |
| --- | --- |
| [01-ts-runtypes-api.md](01-ts-runtypes-api.md) | What `@ts-runtypes/*` provides (markers, factories, fn keys, `getRTFunction`, vite plugin) |
| [02-current-mion-architecture.md](02-current-mion-architecture.md) | How mion + ts-runtypes fit together (run-types adapter, devtools plugin, router dispatch) |
| [03-migration-plan.md](03-migration-plan.md) | The plan that was executed (proxy strategy, router adaptation, phases) |
| [04-progress-log.md](04-progress-log.md) | Dated log of work done, issues found, decisions taken |
| [05-core-audit.md](05-core-audit.md) | Per-feature `@mionjs/core` audit vs ts-runtypes (DELETED / PROXY / KEEP verdicts) |
| [todos/](todos/) | Open follow-up issues, one spec per issue |
| [done/](done/) | Completed follow-up issues (moved from `todos/` on implementation) |

## Follow-up workflow

Discrete follow-up ISSUES live as one spec file per issue under [`todos/`](todos/) and move to
[`done/`](done/) once implemented (mirrors the `docs/todos` → `docs/done` flow in the sibling
`ts-run-types` repo; see the root [`CLAUDE.md`](../CLAUDE.md) → "Migration docs & follow-up
tracking"). Each spec is `# Title` + `**Status:**` + `**Created:**` + evidence + a fix plan.

Open (`todos/`): [examples + website refresh](todos/examples-and-website-refresh.md),
[failOnError adapter pure-fn scanning](todos/failonerror-adapter-pure-fn-scanning.md),
[JIT_FUNCTION_IDS version pinning](todos/jit-function-ids-version-pinning.md).

## Key constraints (from the maintainer)

- mion adapts to ts-runtypes, not the other way round — only touch ts-run-types for actual bugs/gaps.
- As little modification to `@mionjs/router` as possible; `@mionjs/run-types` is a proxy over `@ts-runtypes/core`.

## Version/dependency status (2026-07-15: @ts-runtypes 0.9.2)

- mion consumes **`@ts-runtypes/{core,devtools,bin}@0.9.2` from npm** (0.9.2 ships the upstream follow-ups this migration filed: enumerability guard + `@nonEnumerable`, generic class serializers, tuple-labels-in-id, pattern-message-as-error-val, definition-time mockSample validation, JCP001). Every bump re-hashes all family fn-hashes, so `JIT_FUNCTION_IDS` is refreshed per version and pinned by the run-types adapter spec (tracked: [todos/jit-function-ids-version-pinning.md](todos/jit-function-ids-version-pinning.md)). The platform resolver binary installs via `@ts-runtypes/bin`'s `@ts-runtypes/binary-<os>-<arch>` optional deps — no local checkout or explicit `binary` path needed (the `TS_RUNTYPES_BIN` env var remains a dev convenience). The RpcError/TypedError name/message wire-shape question is RESOLVED — see [done/error-envelope-non-enumerable-props.md](done/error-envelope-non-enumerable-props.md).
- The interim `vendor/ts-runtypes/` tarballs and the `.gitignore` `!vendor` exception were removed with the registry swap.
- `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` covers `unplugin` and `@ts-runtypes/*` until they age past the 30-day policy — remove the entries then.
