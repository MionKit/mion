---
type: feature
spec: full-plan
status: todo
created: 2026-07-26
---

# "e2e passed" should be a checkable precondition of publishing, not a convention

**Status:** todo
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
