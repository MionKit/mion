---
type: chore
spec: guidelines
status: done
created: 2026-08-23
completed: 2026-08-23
---

# A spawned resolver's panic leaves a durable, untruncated stack behind

## Why

A test that spawns `ts-runtypes` used to pass the child's whole Go stack as the assertion message
(`expect(result.status, result.stderr)`). Log pipelines truncate that, and what they drop is the
part that matters: the `fatal error:` line and the frame that raised it. What survives is the
goroutine plumbing at the tail, which names `sync.(*WaitGroup)` and nothing about the defect.

That is not hypothetical. It cost a month on
[convert-cli-compile-panic-under-load.md](convert-cli-compile-panic-under-load.md): filed
2026-08-22 with the header truncated away and unreproducible, closed only when a second occurrence
on the v0.12.2 release gate happened to keep the header — which made it a five-minute fix.

## What shipped

**One shared spawn path**, [helpers/cliCrash.ts](../../packages/ts-runtypes-devtools/test/helpers/cliCrash.ts),
so a new spawning test cannot forget the handling:

- `runCli(args, {cwd, label})` spawns the binary and, on any non-zero exit, writes the full
  stdout+stderr plus argv and status to `logs/cli-crashes/<label>-<pid>.log`. The path is keyed by
  pid so parallel vitest workers never collide and a rerun overwrites rather than litters.
- It returns a **short** `report`: the crash header (the `panic:` / `fatal error:` line and the
  frames under it, capped at 12 lines) followed by the dump's path. Tests assert with
  `expect(result.status, result.report)`, so the message survives truncation while the file keeps
  everything.
- A non-crash failure (a CLI usage error) reports the stderr TAIL instead, which is where a CLI
  puts its reason — the marker regex decides which.
- `GOTRACEBACK=all` is set on every spawned child, so a crash dumps every goroutine rather than
  only the raising one. A deadlock then names all parties.

**Adopted** at the CLI e2e spawn sites: `convert-cli` (where the original crash surfaced),
`compile-cli`, and `cli-surface`. Assertions that check error *content* still read `stderr`
directly — those are expected non-zero exits, not crashes.

**Kept by CI**: both `ci.yml` and `release-gate.yml` upload `logs/cli-crashes/` as an artifact on
failure (14-day retention, `if-no-files-found: ignore`), so one red run is enough.

**Measured** against a binary that really panics: 298 lines of stderr reduced to a 12-line header
naming both `fatal error: concurrent map writes` and the raising frame with its file and line.

**Tested** by [cli-crash-capture.test.ts](../../packages/ts-runtypes-devtools/test/cli-crash-capture.test.ts):
the header keeps the message and the raising frame and drops the goroutine tail, it starts at the
crash marker even when the child logged normally first, it falls back to the whole output when
nothing looks like a crash, and the dump file holds what the short message omits.

## Deliberately not done

- **`-race` in CI.** The parent spec floated it as a reproduction aid. The race it would have
  caught is now covered by a test that trips Go's own concurrent-write detector, and `-race` costs
  a slower suite for every run. Worth revisiting only for races that corrupt state silently rather
  than crash.
- **vitest `retry`.** Still rejected, for the reason it was rejected before: it masks real crashes.
  This work makes a crash *diagnosable*, which is the opposite move.
