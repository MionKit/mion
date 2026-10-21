---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# Three exports in the devtools diagnostic catalog described a protocol that no longer exists

**Status:** done, branch `fix/devtools-unused-diagnostic-exports`
**Filed as:** two unused exports. **Shipped as:** three, see *What changed against the original spec*.

## Intent

[packages/devtools/src/core/diagnosticCatalog.ts](../../packages/devtools/src/core/diagnosticCatalog.ts)
exported functions that nothing imported, and one of them documented a wire protocol the Go side
says was replaced.

```ts
export function alwaysThrowFactory(code: string, siteHint?: string, ...args: string[]): () => never
export function messageForCode(code: string, args?: readonly string[]): string
export function renderDetail(code: string, args?: readonly string[]): string | undefined
```

The `alwaysThrowFactory` that actually runs is a DIFFERENT function with a different signature,
`alwaysThrowFactory(message: string)` in
[packages/run-types/src/runtypes/rtUtils.ts](../../packages/run-types/src/runtypes/rtUtils.ts). It is
what `entryTuple.ts` and `@mionjs/core`'s mion adapter call. The name collision is part of why the
dead one survived unnoticed.

Its JSDoc described the pre-v10 cache protocol: the Go compiler shipping a diag code as the 8th
`init()` arg and an optional `file:line:col` hint as the 9th, with the cache module forwarding both.
`ts-go-runtypes/internal/cachegen/diskcache/format.go` says v10 replaced that, and now persists the
fully rendered runtime throw message in a single tuple slot.

The same JSDoc ended with an ownerless follow-up note, which the comment rules forbid.
`messageForCode` was marked `@deprecated` and called itself an alias for a `diagnosticMessages.ts`
import surface that does not exist in the repo.

## Evidence of unreachability

Repo-wide grep over `.ts .go .mjs .js .json .md`, excluding `node_modules`, `dist`, `third_party`
and `_deps`:

- `messageForCode` and `renderDetail` matched only their own definitions.
- `alwaysThrowFactory` matched its own definition plus the unrelated `rtUtils.ts:214` method, called
  from `entryTuple.ts:768` and `mionAdapter.ts:144`.
- Nothing read a catalog entry's `detail` field either. The website renders detail from its own
  generated JSON, not from this module.

Not on any published subpath. `packages/devtools/src/index.ts` re-exports only `./core/unplugin.ts`,
and the eight `src/runtypes/*.ts` adapters do the same. Every importer of `diagnosticCatalog.ts` uses
named imports (`unplugin.ts:6` and `lint/diagnosticRouting.ts:7` take `renderHeadline` and
`DIAGNOSTIC_CATALOG`), so no star-export chain reached the three.

Generated code cannot call them. `ts-go-runtypes/internal/cachegen/typefunctions/module.go`'s
`buildAlwaysThrowMessage` renders the complete runtime throw text Go-side and emits it quoted into
the entry tuple, where a hole reads as no-throw. The runtime rebuilds the thrower with
`utl.alwaysThrowFactory(record.alwaysThrowMessage)` from `rtUtils.ts`. Nothing under
`ts-go-runtypes/internal/` emits an import of `@mionjs/devtools`.

## Outcome

**1. `packages/devtools/src/core/diagnosticCatalog.ts`** — the three functions and their JSDoc are
gone. `DIAGNOSTIC_CATALOG`, the `DiagnosticEntry` re-export, `substitute` and `renderHeadline` stay.
The file header no longer names the runtime alwaysThrow factory as a consumer, and its pointer to
the generated dictionary now carries the real `go-generated/` path.

**2. Two Go comments asserting the same dead protocol** were corrected in the same PR:

- `internal/diagnostics/catalog.go` said the wire design "mirrors the runtime alwaysThrow pattern
  that already resolves error text JS-side from the diag code". It now says the opposite, which is
  what v10 made true.
- `internal/diagnostics/messages.go` listed "the runtime alwaysThrow factory" among the things that
  render from the generated dictionary. It now points at `buildAlwaysThrowMessage` instead.

Three stale JS paths inside those same sentences were corrected with them:
`packages/run-types/src/runtypes/diagnosticCatalog.ts` (twice, no such file) and
`packages/devtools/src/diagnosticCatalog.generated.ts` (missing the `core/go-generated/` segment).

**3. New test** `packages/devtools/test/diagnostic-catalog-surface.test.ts`, two checks:

- Every locally declared export of the catalog has an importer. It matches a binding imported FROM
  the catalog module, not bare occurrences of the name, because the run-types namesake would
  otherwise make a dead `alwaysThrowFactory` look reachable. That was not a theoretical risk: the
  first draft counted occurrences and passed against a deliberately re-added dead copy.
- Only `rtUtils.ts` declares `alwaysThrowFactory`, so the name collision cannot come back.

Both checks were proven red by re-adding the deleted functions, then green once removed again.

## What changed against the original spec

The spec named two exports. Proving those two dead turned up a third with the same problem,
`renderDetail`, in the same file. Removing it was confirmed with the maintainer before it went in.
It is also what made the "every export has an importer" test possible: leaving `renderDetail` in
would have forced an allow-list of one known dead export, which is the shape of rule that stops
being read.

## Gate

`pnpm run lint` (oxlint, eslint, typecheck), `pnpm run format`, `pnpm run test:ci`, and
`go -C ts-go-runtypes test ./internal/diagnostics/... ./internal/cachegen/...` all green, with the
devtools dist rebuilt, since consumers typecheck against it and the root eslint config loads its
`./eslint` entry through node.

No docs change. Nothing here is consumer-facing: the three functions were on no published subpath
and no website page mentions them.
