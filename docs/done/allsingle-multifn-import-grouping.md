---
type: fix
spec: full-plan
status: done
created: 2026-08-22
---

# allSingle: a multi-function site imports every binding from the FIRST family's bundle

**Shipped in PR [#361](https://github.com/MionKit/ts-run-types/pull/361).** The record below keeps
the original problem statement and diagnosis; **What shipped** at the end states what actually
landed.

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

## What shipped

Exactly the fix direction above, plus the tests and the fixture.

**Production change — four files.**

- `protocol.Site` gained `Modules []string`, positionally mirroring `FnIds`. It is populated only
  for a multi-fn site under allSingle, so single-fn and reflection payloads are byte-identical to
  before; `Module` keeps its meaning and now mirrors `Modules[0]`.
- `stampSiteModules` resolves a bundle **per fnId** instead of once per site. The demand lookup that
  both it and `demandedEntryKeys` need is now the shared `siteFamilyTag` helper — the two must agree
  on the family mapping (one decides which bundle a binding is imported FROM, the other which bundle
  a dropped key's stub is placed IN), and a disagreement between them is exactly an unresolvable
  import, so they no longer open-code it separately.
- `buildImportBlock` indexes its loop and takes the basename from the new `siteModuleFor`
  (`Modules[i]` → `Module` → the entry's own module). Specifier dedup was already there, so the
  result is one import statement per bundle.
- `protocol.ts` mirrors the field as `modules?: string[]`.

**Tests.**

- **Front end** ([module-mode.test.ts](../../packages/ts-runtypes-devtools/test/module-mode.test.ts)) —
  written FIRST and committed red (`0c4d8d4`), green with the fix. `allSingle multi-fn: each binding
  is imported from the family bundle that EXPORTS it` drives the real binary and the real package;
  it failed with `'__rt_UMi_bn9j9Ft' is imported from 'fns/val', which does not export it`. The
  containment check is also applied to both `getRunTypeId` call shapes under allSingle and to
  `default` / `allModules`, so the invariant is pinned mode-independently.
- **Go** ([modulemode_test.go](../../ts-go-runtypes/internal/compiler/resolver/modulemode_test.go)) —
  `TestModuleMode_AllSingle_MultiFnSitePerFamilyImports` (multi-function site),
  `TestModuleMode_AllSingle_MultiSlotPerFamilyImports` (multi-SLOT — mion's `route()` shape), and
  `TestModuleMode_ImportsResolveEveryMode` (the containment guardrail across all three modes, both
  marker forms). Both new allSingle tests were confirmed to FAIL with the behavioural fix reverted:
  `"__rt_pBb_yywSYgI" is imported from "fns/val", which does not export it` and
  `"__rt_fDV_yywSYgI" is imported from "fns/verr", which does not export it`.
- **Fixture** — `bundle_module_multi_fn` in
  [testdata/extra/cases.json](../../ts-go-runtypes/internal/compiler/sourcerewrite/testdata/extra/cases.json),
  the allSingle + multi-fn intersection that was missing. It pins three separate imports, one per
  bundle, and covers the `edits` wire path via `TestComputeEdits_MatchesApply`. Regenerating added
  **only** the new case — no existing fixture byte changed, confirming the fix is inert for every
  shape that already worked.

**Docs.** None needed: the fix restores the behaviour
[04.configuration.md](../../container/website/content/01.introduction/04.configuration.md):17
already describes, and it does not change how ARCHITECTURE.md describes the moduleMode grouping.

## Out of scope (unchanged)

- **The grouping itself.** `moduleGrouping` is correct — the bundles held the right entries all
  along; only the import specifiers were wrong.
- **Making rollup's error message readable.** The containment guardrail now catches this class
  before a bundler ever sees it. Worth its own todo if the unreadable-trace problem recurs for
  another reason.

## Still owed downstream

mion drops its `allSingle` guard once a fixed version ships, and runs the end-to-end verification
that guard currently blocks (their `docs/todos/upstream-allsingle-import-grouping.md`). Tracked in
their repo, not here.
