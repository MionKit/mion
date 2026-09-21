---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# Two exports in the devtools diagnostic catalog describe a protocol that no longer exists

## Intent

[packages/devtools/src/core/diagnosticCatalog.ts](../../packages/devtools/src/core/diagnosticCatalog.ts)
exports two functions that nothing imports, and one of them documents a wire protocol the Go side
says was replaced.

```ts
export function alwaysThrowFactory(code: string, siteHint?: string, ...args: string[]): () => never
export function messageForCode(code: string, args?: readonly string[]): string
```

Neither has an importer anywhere under `packages/*/src`. The `alwaysThrowFactory` that actually runs
is a DIFFERENT function with a different signature, `alwaysThrowFactory(message: string)` in
[packages/run-types/src/runtypes/rtUtils.ts](../../packages/run-types/src/runtypes/rtUtils.ts). It is
what `entryTuple.ts` and `@mionjs/core`'s mion adapter call. The name collision is part of why this
one survived unnoticed.

Its JSDoc describes the pre-v10 cache protocol: the Go compiler shipping a diag code as the 8th
`init()` arg and an optional `file:line:col` hint as the 9th, with the cache module forwarding both.
`ts-go-runtypes/internal/cachegen/diskcache/format.go` says v10 replaced that, and now persists the
fully rendered runtime throw message in a single tuple slot. So the comment documents a protocol the
format notes say is gone.

The same JSDoc ends with an ownerless follow-up note ("Today the renderer ships them as part of the
init() 10th+ args; a follow-up wires that explicitly"), which the comment rules forbid.

`messageForCode` is marked `@deprecated` and calls itself an alias for a `diagnosticMessages.ts`
import surface. No such file exists in the repo.

## What to settle

Confirm both exports are genuinely unreachable, then remove them, their JSDoc, and anything that
only they used. Check before deleting:

- No importer in any package's `src/`, `test/`, or build scripts.
- Not re-exported from any of `@mionjs/devtools`'s public subpaths (`./eslint`, `./oxlint`, `./vite`,
  `./next`, `./runtypes/*`). If either IS on a published subpath, it is a public API removal and
  belongs in a release note, not a silent delete.
- Nothing in `ts-go-runtypes/` emits a call to either by name into generated code.

If `alwaysThrowFactory` here turns out to still be reachable through generated code, then the fix is
the opposite one: correct its JSDoc to the v10 protocol and drop the follow-up sentence.

## Evidence to produce

- The search that proves unreachability, including generated output, not just hand-written sources.
- `pnpm run lint` and `pnpm test` green afterwards, plus a devtools dist rebuild, since consumers
  typecheck against `packages/devtools/dist`.

## Watch out

- Do not delete `renderHeadline`. Both functions call it and it has real importers.
- Two different functions share the name `alwaysThrowFactory`. Make sure every search result you act
  on is the `diagnosticCatalog.ts` one, not the `rtUtils.ts` one.

## Origin

Found during a repo-wide comment simplification pass, by checking the JSDoc's protocol claim against
`diskcache/format.go`. The pass corrected other pointers in the same file but left these two
comments untouched, because the right fix is to remove the code rather than re-word it.
