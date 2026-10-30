---
type: fix
spec: guidelines
status: done
created: 2026-10-30
---

# Next broker `close()` returns before the build shuts down

CI flake (PR #531, run 41133878038): `next-broker.test.ts > moves the invalidation stamp when a type changes`
passed every assertion, then its `finally` failed with `ENOTEMPTY, Directory not empty: '/tmp/rt-next-broker-…'`
on `fs.rmSync(root, {recursive, force})`.

Likely cause: `startBroker`'s `close()` (`packages/devtools/src/runtypes/next/broker.ts`) calls
`built.buildEnd?.call(context)` without awaiting it, so files can still be written into the project dir after
`close()` resolves. Any caller that cleans up after `close()` races it.

Intent: `close()` resolves only once the build has fully shut down (await `buildEnd`, and anything it starts).
Confirm the race first (log writes after close, or loop the test), then fix in src, not by retrying the `rmSync`.
Check the sibling broker tests for the same teardown pattern.

## Plan: close() drains in-flight work (approved 2026-10-30)

Cause, confirmed with `MION_NEXT_DEBUG=1`: not `buildEnd` itself but the broker's own source watcher. The test's
edit of `src/entry.ts` queues a watcher-driven absorb (`rtHotUpdate`: setSources, scan, Go `generate` writing
`<genDir>/types/`, then the stamp). `close()` only cleared the debounce timer, so an absorb already under way
kept running: `generated modules now` was logged after `close()` returned. On a slow runner that regenerate
writes into the dir the test is deleting.

Shipped in `packages/devtools/src/runtypes/next/broker.ts`:

- `close()` awaits `ready`, the request chain and the absorb chain before `buildEnd`. `buildEnd` itself is
  synchronous (`resolver.close()` drains, then kills an idle child), so awaiting it was never the fix.
- `ready` awaits its startup pure-fn artifact write instead of firing it, so `close()` covers that write as well.
- `close()` removes its `process.on('exit')` socket cleanup, which leaked one listener per broker (own commit).

No resolver client change: once in-flight work has answered, the Go child is idle and writes nothing on close.

Tests, each failing before its fix:

- `close() waits for an edit the watcher is still absorbing` holds the absorb at its first file read (a
  `fs.promises.readFile` spy), so the overlap is certain rather than timed.
- `close() returns only once the startup build and its artifact write are done` closes before any request.
- `close() drops its process exit listener` compares `process.listenerCount('exit')`.
