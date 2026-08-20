# Finish absorbing the run-types glue in `@mionjs/core` (umbrella)

**Status:** done — branch `refactor/runtypes-glue-umbrella`, three commits
**Created:** 2026-07-27 (as `docs/todos/runtypes-glue-0-umbrella.md`)

PR #128 moved mion off `@mionjs/run-types` / `@mionjs/type-formats` onto upstream `@ts-runtypes`
0.11.0. The proxy **packages** went with it; what survived was glue folded into `@mionjs/core`,
flagged by three deferred review comments. All three are now resolved.

| # | Child | Landed as |
|---|---|---|
| 3 | format type modules | [format-type-modules-removal.md](format-type-modules-removal.md) |
| 1 | `rtResolver` | [rtresolver-removal.md](rtresolver-removal.md) |
| 2 | pure-fn registry | [pure-fns-out-of-mion-server-mappers.md](pure-fns-out-of-mion-server-mappers.md) |

## What the umbrella got wrong

It opened with a warning that this is *"a SPLIT, not a deletion sweep"*, naming two things that
**must stay**. Both were overruled, and in both cases the umbrella's own evidence was the reason it
looked load-bearing:

1. **"`formatBrands.types.ts` must stay — all 21 exports are live, consumed entirely by
   `@mionjs/drizzle`."** The count was 20, not 21, and the dependency was one type-alias chain in one
   file that round-tripped 20 types through `ExtractBrandName<T>` to recover 20 strings. Decoupling
   drizzle was a ~56-line edit. mion now ships no format or brand vocabulary at all.
2. **"`allowedMapperKeys` is a security control."** This one was *right about the control and wrong
   about the mechanism* — `bodyHash` arrives in the **URL query string**, not the request body, and
   is parsed with no schema validation whatsoever. The gate stayed; everything around it went.

The third correction is the biggest: the umbrella listed `mionAdapter.ts` as *"mion-specific;
**not** in scope"* and treated `rtResolver` as a wrapper worth auditing field-by-field to see what
survived. In fact `rtResolver` had nothing left to buy, and its one real effect was **harmful** — it
discarded upstream's `InitializedTypeFn` guarantee, leaving 14 unguarded `.fn(...)` call sites
unsound with nothing in CI to catch it.

## Net effect

- `packages/core/src/types/formats/` — **gone.** 55 public types, 221 lines.
- `packages/core/src/runtypes/` — `rtResolver.ts` gone; `mionPureFns.ts` → `serverMappers.ts`. What
  is left is `mionAdapter.ts` (marker payloads → the reflection shapes the router consumes) and
  `serverMappers.ts` (a routesFlow transport with a wire-lookup security gate). Both have a
  documented mion-specific reason to exist that is not "reshapes ts-runtypes data".
- mion registers **zero** pure functions and ships **zero** format types.
- **21 pre-existing type errors fixed** — every unguarded `.fn(...)` invocation across router and
  client.
- Three real wire-fidelity bugs fixed (pure-fn `paramNames` discarded on restore,
  `alwaysThrowMessage` never shipped, `familyTag` never shipped).
- mion's duplicate ESLint purity rule removed; upstream's was already running alongside it.

## Filed while here

- [upstream-compiledfnargs-type-lie.md](../todos/upstream-compiledfnargs-type-lie.md) — a publicly
  exported `@ts-runtypes` wire type that cannot describe its own values.
- [routesflow-query-validation.md](routesflow-query-validation.md) — an unvalidated
  attacker-supplied array index, same wire object as `bodyHash`. **Since fixed**: the whole
  `RoutesFlowQuery` is now validated on decode, plus an arity bound while the chain is built.
- Drizzle's column mapping — where the brand vocabulary lives now that mion supplies none. Its brand
  branch is dead code, so the type and runtime lanes disagree. Tracked as a follow-up at the time and
  later dropped: that package's mapping is slated for a rewrite from scratch, not a repair.
- [eslint-rules-tuning-and-docs.md](eslint-rules-tuning-and-docs.md) — its rationale for
  keeping mion's purity rule corrected.

## A note on the guard

The umbrella and all three children assumed `pnpm run lint` typechecks. **It does not** — eslint is
not a typechecker, `packages/examples` is in the eslint ignore list, and CI never builds. So the
guard the specs relied on to prove "nothing referenced the deleted types" did not exist.

This work used explicit `tsc --noEmit` baselines per package plus the examples source-resolution
check, diffed before and after each phase. Standing that up as a real CI gate is worth doing;
`packages/examples/tsconfig.check.json` already says as much in its own header, and
[examples-precompile-debt.md](examples-precompile-debt.md) tracks the path.

## Verification

Per phase: 0 net-new typecheck errors across `core` / `router` / `client` / `drizze` / `examples`;
24 pre-existing errors fixed in total. Full suite green throughout — 719 tests at baseline, 669 at
the end (the drop is the deleted ESLint rule's fixtures; 8 tests were added). Lint 0 errors. The
three client `serverMapFrom` e2e lanes — named, inline/harvested, and unknown-key rejection — all
pass against the live test server.
