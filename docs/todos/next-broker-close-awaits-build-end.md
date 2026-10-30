---
type: fix
spec: guidelines
status: ready
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
