---
type: fix
spec: guidelines
status: done
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
  `checkLinuxCopy`, with the test filling the slots first on a Mac.

Either way, the darwin branch of `checkLinuxCopy` and the test must agree, and `pnpm test` must pass on both hosts.

## Docs

None, because this is a test and build-script fix with no user-facing change.

## Done when

- The test passes, or is skipped with a stated reason, on macOS, and still runs and passes on Linux CI.
- `pnpm test` is green on a macOS host.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan — Mac stamp for the linux slots (approved 2026-10-02)

Chosen direction: the promise holds on macOS too, for a slot already built and stamped. A "CI vs local" switch was
rejected: the Linux vs Mac split is about the binary format (a Linux host binary is already a Linux ELF, a Mac one is
not), not about where the job runs.

- `checkLinuxCopy` (`scripts/core/build.mjs`) takes the host digest (`resolverDigest(ldflags)` / `extractDigest()`) and
  keeps a stamp beside each Mac cross-built copy, `mion-bin/.<name>-linux-<arch>.stamp`. After review, the Mac branch
  is one call to the shared `checkStampedGoBin`, which gained an `env` param (`GOOS=linux`, `GOARCH=<host arch>`)
  instead of a second copy of the stamp, build and compare steps. The shared helper treats an empty file as missing,
  and an unreadable build ID on disk as stale (only the fresh reference must have one). The host digest fingerprints
  the cross-build because its target is fixed to `linux/<host arch>`.
- Under `trustStamp`, a filled slot with a matching stamp is trusted before the Go check, so it needs no Go. Every
  cross-build and every verified compare writes the stamp. An explicit `core build linux-go` still always compares.
- The Go-missing message names the slot: `Go toolchain not found on PATH (needed to build mion-bin/<name>-linux-<arch>).`
- Linux branch unchanged (plain copy).
- Side win: a Mac bench run no longer cross-builds two reference binaries when nothing changed.

Tests (`packages/devtools/test/build-gate.test.ts`): the no-Go test runs on both hosts, and on macOS first fills the
slots with Go, then asserts both linux stamps are trusted. Four macOS-only tests: a disagreeing linux stamp forces the
cross-build compare and re-stamps; a matching stamp beside an empty slot is not trusted (cross-build, re-stamp); an
explicit untrusted `linux-go` ignores a matching stamp; with no Go, a disagreeing linux stamp fails with the new message.

Docs: one sentence each in `SETUP.md` (benchmarks prep on macOS) and `scripts/README.md` (stamps). No website change.
