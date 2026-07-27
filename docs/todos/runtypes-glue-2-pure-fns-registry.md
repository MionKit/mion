# `mionPureFns`: keep the wire allow-list, question the namespace wrappers

**Status:** todo — deferred (see parent)
**Type:** chore
**Spec:** full-plan
**Created:** 2026-07-27

**Parent:** [runtypes-glue-0-umbrella.md](runtypes-glue-0-umbrella.md) — deferred until after PR #128 merges.

Surfaced by PR #128 review comment
[r3634525205](https://github.com/MionKit/mion/pull/128#discussion_r3634525205): *"we should be
using equivalent functionality from ts-runtypes, we have the compiledPureFn data structures etc.
I don't see any reason to have something similar in mion. this file related functionality and test
should be removed."*

## ⚠️ Read this before deleting anything

**`allowedMapperKeys` is a security control on a wire-driven lookup, not a convenience.** Removing
this file wholesale would delete it.

`packages/router/src/routesFlow.ts:303` calls
`getServerMapper(mapping.bodyHash)` — and **`mapping.bodyHash` arrives in the request body**.
`getServerMapper` (`mionPureFns.ts:136`) gates that lookup on `allowedMapperKeys`, a set populated
*only* by mion's own two registration lanes (`registerMionPureFn`, `registerServerMappers`). The
comment at `:36` states the intent precisely: a request must never be able to invoke arbitrary
entries in the shared ts-runtypes pure-fn registry — built-in `rt::` fns, format fns, or entries
registered by unrelated libraries that happen to share the process.

`getRTUtils().getPureFnByKey(key)` — the "equivalent functionality in ts-runtypes" — has **no such
gate**, by design: it is a registry lookup, not a request handler. Swapping one for the other turns
an allow-listed dispatch into an open one.

So the review comment is right about *part* of this file and wrong about the allow-list. The task
is to separate the two.

## What is actually in the file (148 lines)

The `MionCompiledPureFn` type mirror the comment referred to is **already gone** — replaced with
upstream's `CompiledPureFunction` in `418bdb1`. What remains splits in two:

**A. Namespace convenience wrappers — the genuinely questionable half**

- `MION_PURE_FN_NAMESPACE = 'mionjs'` (`:24`), `mionPureFnId(name)` (`:27`)
- `registerMionPureFn` (`:43`) — builds a `CompiledPureFunction` and calls
  `getRTUtils().addPureFn`
- `getMionPureFn` (`:65`) / `hasMionPureFn` (`:70`) — thin passthroughs to
  `getPureFnByKey` / `hasPureFnByKey` with the namespace prefixed

These are ergonomics over upstream calls. `registerMionPureFn` does carry one non-obvious
behaviour worth preserving if it goes: re-registration **overrides** an existing entry
(`:46-51` mutates `createPureFn` and clears the memoised `fn`), which upstream's `addPureFn` may
not do.

**B. The serverMapFrom transport — mion-specific, keep**

`ServerMapperEntry`, `registerServerMappers`, `installServerMapperReader`, `getServerMapper`,
`hasServerMapper`, plus `allowedMapperKeys`. This is the lane where the mion vite plugin harvests
client `serverMapFrom(source, mapper)` calls from the ts-runtypes pure-fn build report and bakes
them into the server bundle via the generated `virtual:mion/server-mappers` module. Upstream has no
equivalent because it is mion's routesFlow feature, not a ts-runtypes one.

## Plan

1. **Decide on half A only.** Either:
   - **Keep**, and document each wrapper's reason (namespace discipline, override-on-re-register,
     one import surface for users) — the file then stops looking like a mirror; or
   - **Remove**, replacing the ~6 call sites (`test-server/src/test-server.ts:284,291` plus the
     public export) with direct `getRTUtils()` calls **and** an explicit `allowedMapperKeys.add()`
     wherever a key must remain wire-reachable. If `registerMionPureFn` goes, its
     override-on-re-register behaviour must be re-implemented or consciously dropped.
2. **Keep half B**, but tighten the file's framing: it is a routesFlow transport with a security
   boundary, not a pure-fn registry. Consider renaming the module (e.g. `serverMappers.ts`) once
   half A is settled, so nothing reads as duplicated registry code.
3. **Whatever happens, the allow-list stays.** If half A is removed, verify `allowedMapperKeys` is
   still populated on every path that can be reached from the wire.

## Tests

`packages/core/src/runtypes/mionPureFns.spec.ts` exists and must keep passing.

- **Add the missing negative test first** — before touching anything. A key that exists in the
  ts-runtypes registry but was **not** registered through a mion lane must NOT resolve via
  `getServerMapper`. That is the security property, and today nothing pins it. If it turns out
  already broken, that is a bug to report, not a refactor.
- Re-registration override: `registerMionPureFn('x', f1)` then `('x', f2)` resolves to `f2`.
- Lazy manifest re-read on miss (`installServerMapperReader` → `getServerMapper` for a key added
  after install).
- `routesFlow` integration: an unknown `bodyHash` from the wire is rejected, never evaluated.

## Out of scope

- Changing the `virtual:mion/server-mappers` plugin contract or the manifest shape.
- `rtResolver.ts` — see [runtypes-glue-1-rtresolver-unwrap.md](runtypes-glue-1-rtresolver-unwrap.md).

## Done when

- The security property has an explicit regression test.
- Every remaining export has a documented reason that is not "wraps ts-runtypes".
- Full suite + lint + format green.
