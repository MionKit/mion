---
type: fix
spec: guidelines
status: done
created: 2026-08-22
completed: 2026-08-23
---

# Intermittent resolver panic in `convert-cli`'s spawned `compile` under full-suite load

## What it was

A data race in our own code: `batchcompile.Run` captured tsgo's emitted files into a plain map
from the `WriteFile` callback, and `Program.Emit` invokes that callback from a PARALLEL work
group. Concurrent writes to a Go map are a **fatal** runtime error, not a recoverable one, so a
colliding emit killed the whole `compile` process with exit status 2.

```
fatal error: concurrent map writes

batchcompile.Run.func1(...)                       internal/compiler/batchcompile/compile.go:158
  microsoft/typescript-go/internal/compiler.(*emitter).writeText   emitter.go:355
  microsoft/typescript-go/internal/compiler.(*Program).Emit.func2  program.go:1675
  microsoft/typescript-go/internal/core.(*parallelWorkGroup).Queue.func1
```

Being a race, it fired only when two emits landed together, which is why it looked like an
intermittent flake: the same tree passed the same job an hour earlier.

## How it was finally caught

On the v0.12.2 release gate ([#366](https://github.com/MionKit/ts-run-types/pull/366)), where the
panic header survived in full. This spec named that header as the missing piece ("the single
biggest obstacle to fixing this"), and with it the diagnosis needed no reproduction at all: the
raising frame is ours and the defect is visible by inspection.

Under load is exactly when it fires, so the original observation (contention with eight vitest
workers) was the right reading. The stress script never reproduced it because compile-on-compile
contention runs separate PROCESSES; the race is between goroutines INSIDE one compile.

## What shipped

- `emitCapture`, a mutex-guarded collector, replaces the bare map. `WriteFile` now goes through
  `capture.add`, so parallel emits serialize on the one map write.
- `TestEmitCapture_ConcurrentWritesAreSafe` hammers it with 32 goroutines × 64 writes. It
  reproduces the identical `fatal error: concurrent map writes` on the unguarded code and passes
  with the guard, without needing `-race` (which CI does not pass to `go test`).

## Deliberately NOT done here, and split out

Direction step 1 — making a spawned resolver's panic leave a durable, untruncated stack behind —
is still worth doing and is now its own spec:
[todos/durable-resolver-panic-capture.md](../todos/durable-resolver-panic-capture.md). It was
diagnosis scaffolding for THIS crash, which no longer needs it, but the next panic in a spawned
binary will.

Step 3 (adding vitest `retry`) stays rejected: it would have masked a real crash.
