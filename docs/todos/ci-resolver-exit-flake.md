# CI flake: "generate: resolver exited" — upstream buildEnd close race (root-caused)

**Status:** todo — upstream fix IMPLEMENTED 2026-07-20 (ts-run-types commit `ab083bcf` on
branch `claude/mion-ts-runtypes-migration-qywc6z`: transport drain-on-close, one
respawn-retry per lost request, per-container buildEnd refcount, 5-test regression
suite; spec now at ts-run-types `docs/done/resolver-client-drain-close-and-retry.md`).
Remaining mion action: bump `@ts-runtypes/*` to the release carrying it (0.10.1) once
merged + published, then move this spec to done. Until then, triage stays re-run on
signature.
**Created:** 2026-07-20

## Signature

`test:ci` fails with `Error: generate: resolver exited` (from
`@ts-runtypes/devtools` `ResolverClient`) with ZERO resolver output — no Go panic, no
diagnostics — either as a startup `AggregateError: Failed to initialize projects` or as
mid-run transform failures where one project's spec files all fail
(`resolver is closed`) while sibling projects stay green.

## Occurrences

1. **Run 29711086477** (head 396c4785): batch 2 init — the devtools project's
   `buildStart` generate died 0.6s in. Batch 1 had passed 597 tests seconds earlier.
2. **Run 29712576457** (head 8b5ecca1, a DOCS-ONLY delta from a green run): batch 1
   mid-run — the router project's resolver died ~1.4s into the test phase; its 12 spec
   files failed transform while core/run-types/type-formats completed green (408/408
   tests). The sibling core project finished ~0.7s before the death.

Both trees pass locally (full suite + the exact failing invocation) and both passed CI
on re-run — pure timing.

## Root cause (upstream)

`@ts-runtypes/devtools` unplugin: `buildEnd() { resolver?.close(); }` hard-closes the
resolver child (`stdin.end()` + `kill()`, no drain). The binary's `--one-shot` loop
exits 0 silently on stdin EOF — hence the zero-output death. One plugin instance (one
resolver) serves BOTH vite environment containers (`client` + `ssr`), and vitest
multi-project invocations close servers on sibling completion/aborted init — whichever
container fires `buildEnd` first kills the shared child under any in-flight request.

**Not memory:** both 4-project batches sampled locally peak ~1.5 GB total (resolver
children ~130 MB each); the original OOM framing is disproven (kept here for the
record — the all-projects single run DID OOM historically, which is why `test:ci` is
batched; that constraint still stands, it just isn't what kills these runs).

## Plan

1. **Now:** on this signature, re-run the job (content-identical amend + push if the
   re-run API is unavailable). Do not debug from scratch; do not restructure batches
   (measured headroom says batching is not the lever).
2. **Fix:** upstream `docs/todos/resolver-client-drain-close-and-retry.md` — drain
   in-flight requests on close, single respawn-retry when the transport closes with a
   request pending, close only on final teardown, regression tests. When a devtools
   release ships with it, bump mion's pinned `@ts-runtypes/*` and delete this spec's
   triage clause (move to done).
