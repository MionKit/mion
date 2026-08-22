---
type: fix
spec: guidelines
status: ready
created: 2026-08-22
---

# Intermittent resolver panic in `convert-cli`'s spawned `compile` under full-suite load

## Intent

A spawned `ts-runtypes compile` panicked once during a full `pnpm test` run, failing
[convert-cli.test.ts](../../packages/ts-runtypes-devtools/test/convert-cli.test.ts):80 with exit
status 2. It has not reproduced since. An intermittent crash in the resolver binary is worth
finding: the suite has **no `retry` configured** in [vitest.config.ts](../../vitest.config.ts), so
every recurrence is a red CI run, and today a recurrence tells you almost nothing because the panic
message does not survive.

## Evidence

Observed once, on 2026-08-22, during the full JS suite:

```
Test Files  1 failed | 287 passed | 2 skipped (290)
Tests  1 failed | 9399 passed | 39 skipped (9439)

 ❯ compileInjectedIds test/convert-cli.test.ts:80:40
     80|   expect(result.status, result.stderr).toBe(0);   // status was 2 (Go panic)
```

All that survives of the stack is its tail:

```
sync.(*WaitGroup).Go.func1()
	.../src/sync/waitgroup.go:258 +0x4a
created by sync.(*WaitGroup).Go in goroutine 1
	.../src/sync/waitgroup.go:238 +0x73
```

The panicking goroutine was started from goroutine 1 via `WaitGroup.Go` — the parallel compile path.
**The panic header (message + the frame that raised it) was lost to log truncation**, which is the
single biggest obstacle to fixing this and is why step 1 below is about capture, not diagnosis.

What did NOT reproduce it:

- A second full `pnpm test` run: 288 files / 9400 tests, exit 0.
- `pnpm exec vitest run convert-cli` alone: 8/8.
- A targeted stress of the exact operation (`compile` on the same fixture project, cleaning
  `dist/` + `__runtypes/` each round): 8-way × 6 rounds, then 24-way × 5 rounds. 168 concurrent
  compiles, all clean.

Host had ample headroom at rest (16 GB RAM, 24 GB disk free), so a plain OOM is not the obvious
explanation, though contention with 8 vitest workers each running heavy transforms is not
reproduced by the stress script either.

## Not caused by the allSingle import-grouping fix

Ruled out before filing, since it was observed on that branch
([#361](https://github.com/MionKit/ts-run-types/pull/361),
[done/allsingle-multifn-import-grouping.md](../done/allsingle-multifn-import-grouping.md)):

- `convert-cli` passes no `--module-mode`, and `compile` defaults to `ModuleModeDefault`
  ([main.go](../../ts-go-runtypes/cmd/ts-runtypes/main.go):162). In that mode `stampSiteModules`
  returns early, so `Site.Modules` is nil and `Site.Module` is `""` — and `siteModuleFor` then
  falls through to `entryBasename(...)`, the exact pre-fix expression. The change is inert on this
  path.
- Regenerating the whole rewrite-fixture corpus added only the new case; **no existing fixture byte
  changed**.
- The panic is compiler-side (under a `WaitGroup`), not in the rewrite.

Whether it predates the branch is unknown — a single observation cannot date it, and it did not
recur to bisect against.

## Direction

The implementer investigates; this is a capture problem before it is a fix problem.

1. **Make the panic survive.** Today a crash surfaces as `status 2` plus a raw Go stack passed as an
   assertion message, which log pipelines truncate. Have the CLI-spawning test helpers persist full
   stderr to a file on non-zero exit (somewhere CI keeps as an artifact), so the next occurrence is
   diagnosable from one run instead of needing a reproduction.
2. **Then reproduce.** The stress script used here (concurrent `compile` on the convert-cli fixture)
   is a starting point but was not severe enough; the distinguishing factor in the real run was
   contention with the whole vitest suite, not compile-on-compile contention. Consider running the
   stress concurrently with the full suite, and running the resolver's own Go tests under
   `-race`.
3. **Decide on retry only after the above.** Adding `retry` to `vitest.config.ts` would mask this
   rather than fix it, and the repo's rules treat "flake" as not a root cause — so it is not the
   first move. It may still be right for CI once the underlying crash is understood and fixed.

## Done when

- A panic in a spawned resolver binary leaves a full, durable stack behind on the first occurrence.
- The crash is either root-caused and fixed, or shown to be an environment limit (with the limit
  named) rather than a defect.
