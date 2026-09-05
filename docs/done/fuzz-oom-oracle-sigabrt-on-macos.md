---
type: fix
spec: guidelines
status: done
created: 2026-09-05
---

# The out-of-memory fuzz oracle misreads a SIGABRT child on macOS

## Intent

One test in the run-types security fuzz harness failed on a macOS host with Node 26.5.0, alone and in the full run:

```
FAIL runtypes test/fuzz/security/securityOracle.unit.test.ts
  > the worker host turns the pre-fix count bomb into a crash record (SB-OOM)
  > reports out-of-memory with the attack and seed, and the test process survives
AssertionError: expected 'child exited (SIGABRT) mid-attack' to match /out of memory|did not return/
```

The worker child did die under the heap cap, but with a bare SIGABRT: its stderr carried neither "heap out of memory" nor "Allocation failed", so `SecurityWorkerHost` (`packages/run-types/test/fuzz/security/securityWorkerHost.ts`) filed it as a generic crash and the oracle's assertion failed.

## What shipped

The host now reads the killing signal first and the stderr text second.

`securityWorkerHost.ts`:

- A new `describeExit` method words a dead child's exit. A child forked under a heap cap that dies by an out-of-memory signal (`SIGABRT`, V8 aborting itself, or `SIGKILL`, the kernel's out-of-memory killer) **while an attack is running** is an out-of-memory, whether or not V8 managed to print its banner. The old stderr match (`heap out of memory|Allocation failed`) stays as the second signal, so a host that does print the banner is classified exactly as before.
- "While an attack is running" means a `step` message arrived first. A child that dies on its way in still reports the plain crash, since nothing was allocating yet.
- `tail()` falls back to the raw last stderr lines when none of them match `FATAL|out of memory|Error`, so a child that dies saying something unexpected still says it in the record.
- A new `workerPath` option on `WorkerHostOptions` (defaulting to the real worker) lets a test fork a different child.

New `packages/run-types/test/fuzz/security/abortWorker.ts`: a stand-in child that reports one attack and then raises a bare `SIGABRT` with nothing on stderr. Erasable TypeScript and type-only imports, like the real worker.

New case in `securityOracle.unit.test.ts`, next to the existing message-based one: it forks that fixture and expects the out-of-memory record with the seed and the attack, and asserts the record carries no V8 banner, which proves the signal alone earned it. It is not gated on the built dist (the fixture loads nothing), so it runs on every host.

Checked by reverting the signal rule alone: the new case then fails with the exact macOS message, `child exited (SIGABRT) mid-attack`.

## Done when

- `pnpm exec vitest run --project runtypes securityOracle` passes on macOS with Node 26 and on Linux CI. ✅ (23 passed on Linux, five consecutive runs)
- The crash record for a heap-capped child that dies with SIGABRT says out of memory, with the attack and the seed, and the test process survives. ✅
