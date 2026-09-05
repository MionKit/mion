---
type: fix
spec: guidelines
status: ready
created: 2026-09-05
---

# The out-of-memory fuzz oracle misreads a SIGABRT child on macOS

## Intent

One test in the run-types security fuzz harness fails on a macOS host with Node 26.5.0, alone and in the full run:

```
FAIL runtypes test/fuzz/security/securityOracle.unit.test.ts
  > the worker host turns the pre-fix count bomb into a crash record (SB-OOM)
  > reports out-of-memory with the attack and seed, and the test process survives
AssertionError: expected 'child exited (SIGABRT) mid-attack' to match /out of memory|did not return/
```

The worker child does die under the heap cap, but with a bare SIGABRT: its stderr carries neither "heap out of memory" nor "Allocation failed", so `SecurityWorkerHost` (`packages/run-types/test/fuzz/security/securityWorkerHost.ts`, the `oom` test around line 111) files it as a generic crash and the oracle's assertion fails. The oracle should recognise this death as the out-of-memory it is, or the harness should make V8 print the message it keys on, so the SB-OOM record is stable across hosts.

Repro:

```bash
pnpm exec vitest run --project runtypes securityOracle
```

## Direction

- Work out what the child actually prints on this host (capture the raw stderr and the exit signal in the crash message first). A SIGABRT under `--max-old-space-size` with no V8 fatal message may be Node 26 aborting before the "JavaScript heap out of memory" line is flushed, or the message going to a different stream.
- Prefer classifying on the signal plus the heap cap (a SIGABRT from a child started with a heap cap, during an allocation attack, is out of memory) over string-matching stderr alone; keep the stderr match as the second signal.
- Pin the fix with a unit case that feeds the host a SIGABRT-without-message exit and expects the out-of-memory record, next to the existing message-based case.
- Verify on Linux too (CI runs there) so the classification does not regress the host that already passes.

The implementer plans the details. The harness imports nothing from `@mionjs/devtools`, the router or core, so this is independent of the batch transport work on the branch it was found on.

## Done when

- `pnpm exec vitest run --project runtypes securityOracle` passes on macOS with Node 26 and on Linux CI.
- The crash record for a heap-capped child that dies with SIGABRT says out of memory, with the attack and the seed, and the test process survives.
