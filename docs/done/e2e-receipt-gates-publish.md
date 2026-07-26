---
type: feature
spec: full-plan
status: done
created: 2026-07-26
completed: 2026-07-26
---

# "e2e passed" should be a checkable precondition of publishing, not a convention

**Status:** done (see [Implemented](#implemented))
**Created:** 2026-07-26 (came out of the `rtx release` review in [docs/done/rtx-release-help-runs-the-release.md](../done/rtx-release-help-runs-the-release.md))

Nothing stops publishing tarballs the e2e never saw. The gate and the publish are separate verbs,
so the ordering is a convention: run `rtx release e2e`, then `rtx release tarballs`. Repack in
between, skip the gate locally, or publish an older `tarballs/` and the publishing verbs cannot
tell. Making "e2e passed" a **checkable** precondition is what the split-out release model was
missing.

## What makes this cheap: the bytes already travel

Traced through the workflows, the same tarballs flow end to end within ONE run:

- [release-gate.yml](../../.github/workflows/release-gate.yml) — the build job packs and uploads the
  `tarballs` artifact; the e2e job and the per-OS binary smoke each download that same artifact
  (`e2e.mjs` then skips its build, since `tarballs/` is populated).
- [publish.yml](../../.github/workflows/publish.yml) — its `gate` job **calls** `release-gate.yml`
  as a reusable workflow, and `publish-npm` (`needs: gate`) downloads the SAME `tarballs` artifact
  before running `rtx release tarballs`.

So the artifact the e2e validated is byte-identical to the one that gets published — no
reproducible-build question to answer, no cross-run correlation to invent. A receipt only has to
travel the same path.

## Plan

1. **Write a receipt on PASS.** At the end of a successful lane,
   [scripts/release/e2e.mjs](../../scripts/release/e2e.mjs) writes `tarballs/.e2e-receipt.json`:
   the version, the backend, which halves ran (`matrix`, `hostSmoke`), the host platform, a
   timestamp, and a **sha256 per tarball**. Checksums are the point: without them the receipt says
   "an e2e passed", not "THESE bytes passed".
2. **Require it when publishing.** [publish-tarballs.mjs](../../scripts/release/publish-tarballs.mjs)
   (`rtx release tarballs`) and [publish.mjs](../../scripts/release/publish.mjs) (`rtx release npm`)
   refuse unless a receipt is present, its version matches `version.json`, and every tarball's
   digest matches. The failure must say WHICH check failed (missing / stale version / N digests
   differ) and name the fix (`pnpm rtx release e2e`).
3. **Carry it in CI.** The e2e job must upload the receipt (its own small artifact, since the
   `tarballs` artifact was uploaded by the earlier build job) and `publish-npm` must download it
   next to the tarballs. Decide which receipts count: the gate runs several backends and per-OS
   smokes, so either require the container-backend one specifically or accept any PASS for the
   matching digests.
4. **One escape hatch, loud.** `--no-receipt` (or `RT_ALLOW_UNVERIFIED_PUBLISH=1`) for the
   first-publish bootstrap and genuine emergencies, printing a conspicuous warning. `manual-publish`
   is the bootstrap path and probably opts out by nature — decide and document.

## Tests

Pure-function core, so most of this unit-tests cleanly:

- Receipt written on PASS with a digest per tarball; not written on failure.
- The verifier accepts a matching set, and rejects each way it can fail: absent, version mismatch,
  one digest changed (repack), a tarball added, a tarball removed.
- The escape hatch bypasses and says so.
- Keep the real lane green: `rtx release e2e` writes a receipt that `rtx release tarballs --dry-run`
  then accepts.

## Done when

- A green e2e leaves a receipt beside the tarballs it validated.
- `rtx release tarballs` / `rtx release npm` refuse bytes no e2e signed off, with an actionable
  message, and the CI path carries the receipt so the release keeps working unchanged.
- The escape hatch exists, is documented in SETUP.md, and is impossible to trip accidentally.

## Out of scope

Signing the receipt (provenance/attestation). This is a self-check against footguns, not a
tamper-proof supply-chain claim; if that is ever wanted, npm provenance is the mechanism, not this.

## Implemented

[scripts/release/receipt.mjs](../../scripts/release/receipt.mjs) is the shared module: `writeReceipt`
/ `readReceipt` / `verifyReceipt`, plus `digestTarballs`, `receiptOptOut` and `describeReceipt`. A
PASS writes `tarballs/.e2e-receipt.json` — version, backend, which halves ran, platform, timestamp,
and a **sha256 per tarball**. A dotfile on purpose: the publishing verbs scan `*.tgz`, so the
receipt can never be mistaken for a package.

**Two divergences from the plan above, both forced by what the code actually does:**

1. **`publish.mjs` is NOT gated** — the plan said to gate it, but it does not publish `tarballs/` at
   all. It bumps the version interactively (committing and tagging), then publishes freshly built
   `dist-binaries/` and `pnpm publish`. A receipt could never match by construction, since the bump
   happens mid-flow. The gate belongs to `publish-tarballs.mjs`, which publishes exactly the
   artifact the e2e validated.
2. **`manual-publish.mjs` warns rather than refuses.** It DOES publish from `tarballs/`, but it
   rebuilds them by default, which invalidates any receipt. It is also the first-publish bootstrap
   and the emergency path, so a hard gate there would only ever be answered with `--no-receipt`. It
   prints the receipt when one is valid and a warning naming the reason when it is not.

**Where it refuses:** `publish-tarballs.mjs` (`rtx release tarballs`) exits 1 unless a receipt
covers exactly these bytes at this version, with a reason that distinguishes "no e2e has run" from
"you repacked after the gate" and points at `pnpm rtx release e2e`. Skipped for `--registry <url>`:
that publish is *part of* running the e2e, so requiring its own receipt would be circular.

**Escape hatch:** `--no-receipt` or `RT_ALLOW_UNVERIFIED_PUBLISH=1`, which prints a conspicuous
warning rather than passing silently.

**CI:** the gate's e2e job uploads `tarballs/.e2e-receipt.json` as its own `e2e-receipt` artifact
(container lane only — the one that runs the full matrix), because the tarballs artifact itself was
uploaded earlier by the build job. `publish.yml`'s `publish-npm` downloads it into `tarballs/`
alongside them. Same run throughout, so the bytes are identical end to end.

**Tests** — [packages/ts-runtypes-devtools/test/release-receipt.test.ts](../../packages/ts-runtypes-devtools/test/release-receipt.test.ts),
13 cases weighted toward the rejections, since a verifier that only ever says yes would gate
nothing: no receipt, wrong version, a repack, a tarball added, a tarball removed, malformed JSON, an
empty dir, plus the escape hatch and two source-level checks that `publish-tarballs.mjs` actually
consults the gate and exits non-zero rather than warning past it. (It lives in the devtools package
because `scripts/` has no vitest project — the same reason `repo-contracts.test.ts` guards the rtx
CLI.)

**Docs:** SETUP.md's pre-publish e2e section, including both deliberately ungated paths.

**Not done:** signing the receipt — out of scope as filed. It is a self-check against footguns, not
a tamper-proof supply-chain claim; npm provenance is the mechanism for that.
