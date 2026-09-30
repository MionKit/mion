---
type: fix
spec: guidelines
status: done
created: 2026-09-30
---

# client-tsconfig-refresh misses a new client file under load

## Intent

`packages/devtools/test/client-tsconfig-refresh.test.ts` ("generates the transport from the client project, imports it, and follows a client edit") failed once in 5 full-suite runs of the same tree on 2026-09-30:

```
Error: timed out waiting for the regenerated table after a new client file
 ❯ waitFor test/helpers/inline.ts:346:9
 ❯ test/client-tsconfig-refresh.test.ts:131:5
```

It passed in the other 4 runs. The failing run had 4 workers busy on long files (a `core test-skip` run over 156 files). The step before it, a client EDIT, regenerated fine; only the NEW file created while the dev server runs timed out.

`waitFor` already allows 20 seconds (`packages/devtools/test/helpers/inline.ts:339`), which is long for one regeneration. So a missed watcher event for a file created in the client's source root is as likely as slowness. Find which one it is and fix the cause: a real missed event is a product bug in the client `tsConfig` watch, not a test to retry.

## Direction

- Reproduce under load, for example by running the file many times with `--repeat` next to a CPU-heavy run, and log whether the watcher ever reports `src/later.ts`.
- Look at how the client project's source root is watched for new files (the `client.tsConfig` path in `packages/devtools/src/`), and whether an add that lands during a running regeneration can be dropped.
- Never skip the test or just raise the timeout without a cause.

## Done when

- The cause is found and fixed, with a test that fails before the fix.
- The file passes repeated runs under load.

## Plan — root cause and fix (approved 2026-09-30)

**Cause: a real missed event, not slowness.** Every generate called `watcher.add(root)` again for each client source root (`reportGenerate` in `packages/devtools/src/core/unplugin.ts`). chokidar re-scans a directory on every `add()`, and a file it finds during that scan is treated as an INITIAL file, which vite's `ignoreInitial: true` never reports. The file is then marked as known, so the later directory event raises nothing either. In the test, the client edit's regenerate re-added `client/src` right as `later.ts` was written, so under load the add could land inside that scan and be swallowed.

Reproduced with vite's own watcher: writing 40 new files 0-4 ms after `watcher.add(root)` missed 3 of 40; the same loop without the re-add missed 0.

**Fix:** a `watchedBatchRoots` set; `watchBatchRoots()` adds each root once per watcher (cleared when `configureServer` hands over a new watcher). Both `reportGenerate` and `configureServer` go through it.

**Test:** `client-tsconfig-refresh.test.ts` spies on `vite.watcher.add` after the first generate and checks the client edit's regenerate does not re-add `client/src`. It fails before the fix and passes after. The file also passed repeated runs under CPU load.
