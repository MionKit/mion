---
type: chore
spec: guidelines
status: ready
created: 2026-08-23
---

# A spawned resolver's panic should leave a durable, untruncated stack behind

## Intent

When a test spawns `ts-runtypes` and the binary panics, all the harness keeps is `status 2` plus
whatever Go wrote to stderr, passed as an assertion message. Log pipelines truncate that, so the
part that names the raising frame is the part most likely to be lost.

Split out of [done/convert-cli-compile-panic-under-load.md](../done/convert-cli-compile-panic-under-load.md),
which was root-caused and fixed without this. That fix is not evidence the problem went away, only
that we got lucky: the crash was first seen on 2026-08-22 with the header truncated away and could
not be diagnosed, and it took a second, month-later occurrence that happened to keep the header to
close it. The header is what turned a week-old mystery into a five-minute fix.

## Direction

1. Have the CLI-spawning test helpers persist full stderr to a file on non-zero exit, somewhere CI
   keeps as an artifact — the assertion message stays short, the file holds everything.
2. Prefer one shared helper over per-test handling, so a new spawning test cannot forget it. The
   convert-cli helper (`compileInjectedIds` in
   [convert-cli.test.ts](../../packages/ts-runtypes-devtools/test/convert-cli.test.ts)) and the
   other spawn sites are the surface to cover.
3. Consider `GOTRACEBACK=all` for spawned resolver processes in tests, so a deadlock or a crash in
   a non-main goroutine dumps every stack rather than just the offender's.

## Done when

A panic in a spawned resolver binary is diagnosable from ONE CI run: the full header (message plus
the raising frame) survives, without needing a local reproduction.

## Worth knowing

Running the Go suite under `-race` was listed as a reproduction aid in the original spec and was
never adopted; CI runs a bare `go test ./internal/...`. The fix that closed the parent spec is
covered by a test that trips Go's own concurrent-write detector instead, so `-race` is not required
for that case, but it would still catch races that only corrupt state rather than crash.
