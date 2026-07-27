# Remove the last `jitUtils` residue (dead field + stale comment)

**Status:** todo
**Type:** chore
**Spec:** full-plan
**Created:** 2026-07-27

Surfaced by PR #128 review comment
[r3634345232](https://github.com/MionKit/mion/pull/128#discussion_r3634345232): *"all this
functions from jitUtils should be removed from source code … in fact the full jitUtils should be
removed if possible."*

## Problem

The `jitUtils` module is **already gone** — it was the object passed to every generated compiled
function, and that role moved to `@ts-runtypes/core`'s own `RTUtils`. Two references survived the
deletion, both in `packages/core/src/types/pureFunctions.types.ts`:

- **`:34`** — a live-looking `jitUtils: unknown` field on the factory-arg shape. Nothing reads it,
  and nothing can: the object it referred to no longer exists.
- **`:96`** — a comment describing a field as *"Pure function body hash identifier in jitUtils
  cache"*. The cache is now ts-runtypes' `pureFnsCache`.

A dead field on a public type is worse than dead code: it is a shape consumers can still satisfy,
implying a contract mion no longer honours.

## Plan

1. `packages/core/src/types/pureFunctions.types.ts:34` — delete the `jitUtils: unknown` field.
   Check the enclosing type first: if `jitUtils` was its only member, the type itself is dead and
   should go with it, along with its export from `packages/core/index.ts`.
2. `packages/core/src/types/pureFunctions.types.ts:96` — reword the comment to name the real
   location (the ts-runtypes pure-fn cache, keyed `<namespace>::<fnName>`).
3. Re-grep for `jitUtils` across `packages/` (excluding `node_modules` and generated
   `build/`/`dist/` output) and confirm zero source hits. Generated `.js.map` artifacts under
   `packages/test-server/build/` still contain the old name and regenerate on build — leave them.
4. Check whether the factory-arg type is referenced by `@mionjs/devtools`; if so, rebuild it
   (`pnpm --filter @mionjs/devtools run build`) so consumers pick up the change.

## Tests

No new tests. This is dead-code removal with no behaviour change — the existing suites are the
regression net. Run `pnpm run test` (718 tests / 46 files) plus `pnpm run lint`.

## Out of scope

- The `routesCache` / method-registry functions the original comment mentioned as *"should be
  extracted into regular module functions"*. Those already live in `packages/core/src/routerUtils.ts`
  as plain module functions, not as `jitUtils` props — that half of the comment is already
  satisfied.
- Anything in `rtResolver.ts` — tracked in [runtypes-glue-1-rtresolver-unwrap.md](runtypes-glue-1-rtresolver-unwrap.md).

## Done when

- `grep -rn jitUtils packages/ --include='*.ts'` returns nothing outside generated build output.
- Full suite + lint + format green.
