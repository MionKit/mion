# mion → ts-runtypes migration — overview

**Status:** done (completed-migration record)
**Created:** 2026-07-11

Goal (achieved): replace `@mionjs/run-types` (runtime JIT type system) and the AOT
cache-generation machinery in `@mionjs/devtools` with the published **`@ts-runtypes/*`**
packages (fully precompiled, vite-plugin driven), keeping changes to `@mionjs/router` as small
as possible.

**The whole monorepo builds and tests green on `@ts-runtypes/*@0.9.2`** (PR #123). What remains
are discrete, non-blocking follow-ups tracked under [`../todos/`](../todos/).

## The rest of this record (all completed → live in `../done/`)

| Doc | Content |
| --- | --- |
| [ts-runtypes-api-reference.md](ts-runtypes-api-reference.md) | What `@ts-runtypes/*` provides (markers, factories, fn keys, `getRTFunction`, vite plugin) |
| [mion-architecture-after-migration.md](mion-architecture-after-migration.md) | How mion + ts-runtypes fit together (run-types adapter, devtools plugin, router dispatch) |
| [migration-plan-executed.md](migration-plan-executed.md) | The plan that was executed (proxy strategy, router adaptation, phases) |
| [progress-log.md](progress-log.md) | Dated log of work done, issues found, decisions taken |
| [core-audit.md](core-audit.md) | Per-feature `@mionjs/core` audit vs ts-runtypes (DELETED / PROXY / KEEP verdicts) |
| [ts-runtypes-0.9.2-upgrade.md](ts-runtypes-0.9.2-upgrade.md) | The 0.9.2 upgrade (prefixes, config passthroughs, examples) |
| [error-envelope-non-enumerable-props.md](error-envelope-non-enumerable-props.md) | TypedError/RpcError keep internal message/name off the wire |

## Open follow-ups (`../todos/`)

- [examples + website refresh](../todos/examples-and-website-refresh.md)
- [failOnError adapter pure-fn scanning](../todos/failonerror-adapter-pure-fn-scanning.md)
- [JIT_FUNCTION_IDS version pinning](../todos/jit-function-ids-version-pinning.md)

See the root [`CLAUDE.md`](../../CLAUDE.md) → "Docs & follow-up tracking (`docs/`)" for the
`todos/` → `done/` workflow.

## Key constraints (from the maintainer)

- mion adapts to ts-runtypes, not the other way round — only touch ts-run-types for actual bugs/gaps.
- As little modification to `@mionjs/router` as possible; `@mionjs/run-types` is a proxy over `@ts-runtypes/core`.

## Version status (2026-07-15)

mion consumes **`@ts-runtypes/{core,devtools,bin}@0.9.2`** from npm. Every bump re-hashes all
family fn-hashes, so `JIT_FUNCTION_IDS` is refreshed per version and pinned by the run-types
adapter spec (tracked: [../todos/jit-function-ids-version-pinning.md](../todos/jit-function-ids-version-pinning.md)).
The platform resolver binary installs via `@ts-runtypes/bin`'s `@ts-runtypes/binary-<os>-<arch>`
optional deps (the `TS_RUNTYPES_BIN` env var remains a dev convenience). `minimumReleaseAgeExclude`
in `pnpm-workspace.yaml` covers `unplugin` + `@ts-runtypes/*` until they age past the 30-day policy.
