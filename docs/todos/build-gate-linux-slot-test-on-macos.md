---
type: fix
spec: guidelines
status: ready
created: 2026-10-02
---

# Build-gate linux slot test fails on macOS

## Intent

`pnpm test` must be green on a macOS host. One test fails there on current `main`:
`packages/devtools/test/build-gate.test.ts`, "fills the linux slots from trusted binaries with no Go on PATH".

```
-> Checking mion-bin/mion-linux-arm64...
* core build: Go toolchain not found.
CliError at checkLinuxCopy (scripts/core/build.mjs) via fail
```

The test runs `trusted(['linux-go', 'linux-extract'], withoutGo())` and expects exit 0. On darwin,
`checkLinuxCopy` in `scripts/core/build.mjs` always needs Go for the linux slot (it cross-builds, or verifies an
existing copy against a fresh cross-build), so with Go removed from PATH it can never pass on a Mac. CI runs on
Linux, where the slot is a plain copy of the trusted host binary, so CI stays green and hides it.

## Direction

The implementer plans the details. Decide what the test is meant to prove:

- If "no Go needed to fill the linux slots" is a Linux-only promise (the smoke job), the test should only run on
  Linux, and say so.
- If it should also hold on macOS (trusting an existing linux copy under `trustStamp`), the fix is in
  `checkLinuxCopy`, with the test unchanged.

Either way, the darwin branch of `checkLinuxCopy` and the test must agree, and `pnpm test` must pass on both hosts.

## Docs

None, because this is a test and build-script fix with no user-facing change.

## Done when

- The test passes, or is skipped with a stated reason, on macOS, and still runs and passes on Linux CI.
- `pnpm test` is green on a macOS host.
- The simplify-comments pass ran on every touched source file, committed on its own.
