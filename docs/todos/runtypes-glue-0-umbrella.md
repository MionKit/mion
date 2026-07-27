# Finish absorbing the run-types glue in `@mionjs/core` (umbrella)

**Status:** todo — umbrella; deferred until after PR #128 merges
**Type:** chore
**Spec:** umbrella (children carry the full plans)
**Created:** 2026-07-27

## ⚠️ This is a SPLIT, not a deletion sweep

The obvious reading of this umbrella — *"delete what is left of run-types from core"* — is wrong,
and acting on it would remove two things that must stay:

1. **`allowedMapperKeys` is a security control.** `packages/router/src/routesFlow.ts:303` resolves
   `getServerMapper(mapping.bodyHash)` where **`bodyHash` arrives in the request body**. The
   allow-list is what stops a request from reaching arbitrary entries in the shared ts-runtypes
   pure-fn registry. Upstream's `getPureFnByKey` has no equivalent gate — by design, it is a
   registry lookup, not a request handler. See [child 2](runtypes-glue-2-pure-fns-registry.md).
2. **`formatBrands.types.ts` must stay.** All 21 exports are live, consumed entirely by
   `@mionjs/drizzle`, and **none has an upstream equivalent**. See
   [child 3](runtypes-glue-3-format-type-modules.md).

Each child spec states what stays and why. Read them before deleting anything.

## Naming, so nobody looks for the wrong thing

The **packages** `@mionjs/run-types` and `@mionjs/type-formats` are already **deleted** (commits
`ffeeeb3` / `bd5ebaa`, recorded in
[../done/proxy-packages-removal.md](../done/proxy-packages-removal.md)). What remains is the glue
that was *folded into* `@mionjs/core` during that migration:

| Area | Lines | Status |
| --- | --- | --- |
| `packages/core/src/runtypes/mionAdapter.ts` | 375 | mion-specific (marker → reflection); **not** in scope |
| `packages/core/src/runtypes/mionPureFns.ts` | 148 | [child 2](runtypes-glue-2-pure-fns-registry.md) |
| `packages/core/src/runtypes/rtResolver.ts` | 74 | [child 1](runtypes-glue-1-rtresolver-unwrap.md) |
| `packages/core/src/types/formats/*` | 221 | [child 3](runtypes-glue-3-format-type-modules.md) |

## Why deferred

All three surfaced as PR #128 review comments. Each needs either a design decision or a
consumer-wide audit, and two touch **public API**:

- `resolveJIT` / `resolveCompiledPureFn` are exported from `packages/core/index.ts` and used at 15+
  call sites across the router.
- The format type modules are exported types; deleting them is breaking for anyone importing them
  directly (defensible pre-1.0 at `@mionjs/core` 0.8.x, but a deliberate call).

PR #128 is already large (proxy-package removal + the @ts-runtypes 0.11.0 upgrade). The three small
review items — [jitutils residue](../done/jitutils-dead-residue.md),
[fn-key contract](../done/fn-keys-single-source-of-truth.md), and
[param names](param-names-from-reflection.md) — ship with it; these three follow after merge.

## Children

| # | Spec | Thrust | Public API? |
| --- | --- | --- | --- |
| 1 | [runtypes-glue-1-rtresolver-unwrap.md](runtypes-glue-1-rtresolver-unwrap.md) | Drop the dead `normalizeArgs`; decide whether `resolveJIT` survives the optionality audit | **yes** |
| 2 | [runtypes-glue-2-pure-fns-registry.md](runtypes-glue-2-pure-fns-registry.md) | Keep the wire allow-list; question the `mionjs`-namespace wrappers | no |
| 3 | [runtypes-glue-3-format-type-modules.md](runtypes-glue-3-format-type-modules.md) | Delete one module (0/24 consumers), trim one (1/10), keep one (21/21) | **yes** |

## Suggested order

**3 → 1 → 2.** Child 3 is mostly mechanical deletion with a typecheck as its guard, so it clears
noise cheaply. Child 1's optionality audit is the biggest single piece of thinking and gates how
much of the wrapper layer survives. Child 2 is last because its outcome partly depends on whether
`rtResolver` still exists — and because it needs a security regression test written **before** any
refactor.

## Done when

- All three children are in [../done/](../done/).
- `packages/core/src/runtypes/` contains only code with a documented mion-specific reason to exist.
- No export under `packages/core/src/types/formats/` has zero consumers.
- The security property in child 2 has an explicit regression test.
