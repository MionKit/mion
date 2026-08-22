---
type: fix
spec: full-plan
status: ready
created: 2026-08-22
---

# allSingle: a multi-function site imports every binding from the FIRST family's bundle

## Problem

Under `moduleMode: 'allSingle'` the compiled-fn cache is grouped into per-family bundles
(`types/fns/<family>.js`). A **multi-function** call site — one whose trailing
`InjectTypeFnArgs<T, F1, F2, …>` marker names more than one family — injects several entry
bindings that live in DIFFERENT bundles, but the rewrite imports all of them from the bundle of
the FIRST family. Every binding belonging to the other families is unresolvable.

`createStandardSchema<T>()` carries `InjectTypeFnArgs<T, 'val', 'verr', 'jsonSchema'>`
([packages/ts-runtypes/src/standard/createStandardSchema.ts](../../packages/ts-runtypes/src/standard/createStandardSchema.ts):69),
so one call injects three bindings spanning three bundles. It emits one import:

```
import {__rt_nPZ_bn9j9Ft, __rt_pBb_bn9j9Ft, __rt_UMi_bn9j9Ft} from 'rtmod:/fns/val.js';

fns/val        exports: __rt_nPZ_bn9j9Ft          ← only this one resolves
fns/verr       exports: __rt_pBb_bn9j9Ft
fns/jsonSchema exports: __rt_UMi_bn9j9Ft
```

No import is emitted for `fns/verr.js` or `fns/jsonSchema.js` at all. The multi-slot shape (one
call, several markers, different families) fails identically. `default` and `allModules` both emit
one correct import per entry module — the bug is specific to `allSingle`.

Two downstream failure modes, both hard to diagnose:

- **rollup / `vite build`** validates import names against the target's exports, so it fails at
  build time — but the error body is empty and the offset lands thousands of columns into the
  single-line import block, so the message names neither the binding nor the target.
- **esbuild / vite-node (vitest)** does not validate, so the unresolved names are `undefined` at
  runtime. The injected marker payload degrades to `slots=[…,"UNDEF","UNDEF",…]` and fails far from
  the cause.

Reported downstream by mion (`docs/todos/upstream-allsingle-import-grouping.md` in that repo),
measured on their `test-server`: 605 bindings imported from `val.js`, which exports 99 — 537
unresolvable. mion currently rejects `moduleMode: 'allSingle'` outright to avoid it.

**Not a regression.** `allSingle` has never handled a multi-function site correctly. Every existing
`allSingle` test — Go ([modulemode_test.go](../../ts-go-runtypes/internal/compiler/resolver/modulemode_test.go))
and JS ([module-mode.test.ts](../../packages/ts-runtypes-devtools/test/module-mode.test.ts)) — used
single-family sites, and every multi-function test
([standardschema_test.go](../../ts-go-runtypes/internal/compiler/resolver/standardschema_test.go),
[multislot_test.go](../../ts-go-runtypes/internal/compiler/resolver/multislot_test.go),
`testdata/multi_fn.json`) runs in default mode. The two features had no intersecting coverage.

## Root cause

`protocol.Site.Module` is a **single** string, but a multi-function site needs one module **per
fnId**. Two places assume the scalar:

1. [dispatch.go](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go):576 — `stampSiteModules`
   matches the demand whose `FnHash == site.FnId` and stamps that one bundle. `FnId` mirrors
   `FnIds[0]`, so the remaining fnIds are never consulted.
2. [transform.go](../../ts-go-runtypes/internal/compiler/sourcerewrite/transform.go):189 —
   `buildImportBlock` loops `siteFnIds(site)` and reuses `site.Module` as the basename for *every*
   fnId.

`demandedEntryKeys` ([dispatch.go](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go):400)
already does the correct per-fnId demand lookup for stub tagging — the exact shape
`stampSiteModules` needs. The bindings themselves (`slotBinding`, transform.go:263) are already
correct; only the import specifier is wrong.

Both `transformMode: 'go'` and `'edits'` route through `buildImportBlock`, and the JS side only
remaps `rtmod:` specifiers to relative paths (`resolver-client.ts:127`) — so this is a single-point
fix with no JS twin logic to mirror.

## Fix direction

Make the module stamp per-fnId, keeping the scalar wire byte-stable for single-fn sites.

1. **[protocol.go](../../ts-go-runtypes/internal/protocol/protocol.go):336** — add
   `Modules []string` (`json:"modules,omitempty"`) to `Site`, mirroring `FnIds` element-for-element.
   Populate it only when the site has more than one fnId under `allSingle`; `Module` keeps its
   current meaning (the scalar — `FnIds[0]`'s bundle, or the runtypes bundle for a reflection site)
   so single-fn payloads stay byte-identical.
2. **dispatch.go:576** — rewrite `stampSiteModules` to walk every fnId and resolve each one's family
   bundle from the site's own `Demand` (`demand.FnHash == fnId` → `FnsBundleDir + "/" +
   demand.FamilyTag`). Factor that lookup into a shared helper and reuse it from `demandedEntryKeys`
   (dispatch.go:425), which open-codes the same loop today. Keep stamping `Module` exactly as now.
3. **transform.go:189** — index the loop and pick the basename per fnId: `site.Modules[i]` when in
   range and non-empty, else `site.Module`, else `entryBasename(...)`. Dedup by specifier is already
   there, so the result is one import statement per family bundle.
4. **[protocol.ts](../../packages/ts-runtypes-devtools/src/protocol.ts):205** — mirror the new field
   as `modules?: string[]` next to `module?: string`.

## Tests

**The front-end reproduction is already committed and RED** (commit `0c4d8d4`) — make it green
first, then add the Go-side cover below.

- **[module-mode.test.ts](../../packages/ts-runtypes-devtools/test/module-mode.test.ts) — landed.**
  `allSingle multi-fn: each binding is imported from the family bundle that EXPORTS it` drives the
  real binary and the real package, and asserts (a) every injected `rtmod:` import name is exported
  by its target module and (b) one import per family bundle. It currently fails with
  `'__rt_UMi_bn9j9Ft' is imported from 'fns/val', which does not export it` — the readable
  diagnostic rollup never gives. The same file also pins the containment invariant for both
  `getRunTypeId` call shapes under `allSingle` (marker coverage rule) and for `default` /
  `allModules`, so the invariant is mode-independent. Those four pass today.
- **modulemode_test.go** — Go twin of the multi-fn case (`standardSchemaDTS`) plus the multi-slot
  shape (`multislot_test.go`'s `twoSlot`, `verr` + `jsonDecoder` / `jsonEncoder`), which fails today
  too. Assert the site carries a `Modules` entry per fnId and that the transform emits one import
  per bundle. Add the Go twin of the containment guardrail across all three modes.
- **[sourcerewrite/testdata](../../ts-go-runtypes/internal/compiler/sourcerewrite/testdata)** — add
  the missing intersection fixture: `allSingle` + multi-fn.
  [gen-sourcerewrite-fixtures/main.go](../../ts-go-runtypes/cmd/gen-sourcerewrite-fixtures/main.go):206
  already builds an `allSingle` single-fn case and `testdata/multi_fn.json` a default-mode multi-fn
  case; the combination is absent. Extend the generator and regenerate
  (`go -C ts-go-runtypes run ./cmd/gen-sourcerewrite-fixtures`), then review the diff —
  `TestApply_Fixtures` is a reviewed snapshot. This fixture also pins the `edits` wire path via
  `TestComputeEdits_MatchesApply`, so the Go⇄JS twin is covered.
- Run `go -C ts-go-runtypes test ./internal/...` and, after rebuilding the resolver, `pnpm test`.

## Docs

No user-facing change: the fix restores the behaviour
[04.configuration.md](../../container/website/content/01.introduction/04.configuration.md):17
already describes. Touch [docs/ARCHITECTURE.md](../ARCHITECTURE.md) only if the fix changes how the
moduleMode grouping is described there.

## Out of scope

- **The grouping itself.** `moduleGrouping` (dispatch.go:549) is correct — the bundles hold the
  right entries; only the import specifiers are wrong.
- **`default` / `allModules`**, which are unaffected (now pinned by the landed FE tests).
- **Making rollup's error message readable.** Worth its own todo if it recurs; the containment
  guardrail catches this class before a bundler ever sees it.
- **mion's side.** Once a fixed version ships they drop their `allSingle` guard and run the
  end-to-end verification it currently blocks. Tracked in their repo.

## Done when

- The landed FE test `allSingle multi-fn: each binding is imported from the family bundle that
  EXPORTS it` passes.
- A multi-function site under `allSingle` emits one import per family bundle, and every imported
  binding is exported by its target module.
- The multi-slot shape (several markers on one call, different families) does the same.
- The containment guardrail holds across all three module modes on both sides (JS landed, Go added).
- The `allSingle` + multi-fn sourcerewrite fixture is committed and `edits` mode matches `go` mode
  over it.
- `go -C ts-go-runtypes test ./internal/...` and `pnpm test` are green.
- The fix ships in a release, so mion can drop its guard.
