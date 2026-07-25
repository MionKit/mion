---
type: docs
spec: full-plan
status: ready
created: 2026-07-25
---

# Reconcile publish-model docs: describe the shipped token staging, drop the unshipped OIDC narrative

## Origin

Split out of [docs/done/staged-npm-publish-and-deploy.md](../done/staged-npm-publish-and-deploy.md)
during the 2026-07-25 `docs/partially/` triage, then further trimmed 2026-07-25 after review: the
sibling "first-release bring-up" work item was retired (the pipeline has since run green multiple
times on `prod` and `@ts-runtypes/core@0.10.0` is live), and the OIDC-migration work item was
dropped by owner decision — we intentionally stay on token staging + 2FA-approval and are NOT
migrating to OIDC trusted publishing. **All that remains is fixing the docs that still describe
the unshipped OIDC model.**

## Reality (verified 2026-07-25)

- `.github/workflows/publish.yml:154-164` (`publish-npm` job) writes
  `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` to `~/.npmrc` and **hard-fails when
  `NPM_TOKEN` is empty**.
- `id-token: write` is granted **only for optional provenance** (`RT_NPM_PROVENANCE`, repo
  variable, OFF by default because the source repo is private) — NOT for authentication
  (`publish.yml:101-110`).
- `scripts/lib/env.mjs:49` lists `NPM_TOKEN` (scope `secret`, task `publish-npm`) as a required
  input for both the local interactive publish and CI stage-publish.
- Staging still needs no 2FA; the 2FA gate is `pnpm rtx release stage-approve`
  (`scripts/release/stage-approve.mjs`), which auto-dispatches `website-deploy.yml` after npm
  serves the version. `scripts/release/verify-live.mjs` guards the deploy against a lockstep
  mismatch. **None of that changes** — this todo is doc-only.

## Fix the following places

Each item below is a concrete edit; make the doc/script describe the shipped token+2FA model
and delete the OIDC framing (registration, "no `NPM_TOKEN`", "delete the repo secret"). Keep
the provenance paragraph as-is — provenance staying gated on `RT_NPM_PROVENANCE` is accurate.

- **[SETUP.md](../../SETUP.md) — the "Releasing through CI" section (heading + body).** Currently
  titled "**Releasing through CI — staged publishing + trusted publishing (OIDC)**" and framed
  around Trusted Publishing / OIDC / "no `NPM_TOKEN` in CI". Rewrite:
  - Heading → drop "trusted publishing (OIDC)"; e.g. "Releasing through CI — staged publishing
    (`NPM_TOKEN`) + 2FA approval".
  - Replace the "Trusted Publishing (OIDC)" bullet with a "Token staging" bullet: CI authenticates
    with `NPM_TOKEN` (automation/granular token so the unattended stage isn't 2FA-blocked); the
    2FA gate happens on **approval**, not stage.
  - Delete the "trusted publisher configured **stage-only**" line — we do not have a trusted
    publisher; the token itself is scoped to allow stage but the enforcement point is that
    `publish-npm` only runs `npm stage publish`, and approvals are gated by 2FA.
  - Keep the "Approve the staged release", "Deploy the docs site", and provenance paragraphs.
- **[SETUP.md](../../SETUP.md) — the "First-publish bootstrap (one-time, in order)" subsection.**
  Steps 2 and 3 describe registering an OIDC trusted publisher and then deleting the
  `NPM_TOKEN` **repo secret**. Delete them. Since the bootstrap has completed
  (`@ts-runtypes/core@0.10.0` is live and CI has run green), consider condensing the whole
  subsection into a short note that says "the initial versions were published manually with
  `pnpm rtx release manual-publish` before CI took over; use the same command to bootstrap any
  new sibling package before its first CI release."
- **[SETUP.md](../../SETUP.md) — line-level claims to fix in the surrounding prose.** The mid-doc
  aside near line 358 says the CI staging happens "**via OIDC — see below**"; change to "via
  `NPM_TOKEN` — see below". Cross-check every other "OIDC" / "trusted publisher" / "no
  `NPM_TOKEN`" hit in the file (`grep -n 'OIDC\|trusted publish\|NPM_TOKEN' SETUP.md`) and
  fix each so the whole file agrees with `publish.yml`.
- **[scripts/release/manual-publish.mjs:168](../../scripts/release/manual-publish.mjs#L168)** —
  the "Next (one-time)" success message tells the operator to register the trusted publisher
  and says "every future release stages via OIDC in CI". Rewrite: CI stages with `NPM_TOKEN`;
  the follow-up runbook step is to make sure the repo `NPM_TOKEN` secret is set (or to add a
  new sibling package to the token's scope), NOT to register OIDC.
- **This spec's origin doc** — [docs/done/staged-npm-publish-and-deploy.md:10](../done/staged-npm-publish-and-deploy.md#L10)
  is the only inbound link; update the pointer to this file's new name when the rename lands
  (already done in this same PR — leaving the note here so it doesn't get re-broken).

## Verification

- `grep -n 'OIDC\|trusted publish' SETUP.md scripts/release/*.mjs .github/workflows/publish.yml`
  returns ONLY hits that are still true (provenance-adjacent) or that survive as historical
  notes; no active instruction to the reader mentions OIDC after the edit.
- `grep -n 'NPM_TOKEN' SETUP.md` matches the token-model narrative (required, in `.env`
  locally, `secrets.NPM_TOKEN` in CI) — nothing tells the reader to delete it or that CI
  runs without it.
- SETUP.md's "Releasing through CI" section end-to-end steps still work by cross-check against
  `.github/workflows/publish.yml`, `scripts/release/stage-approve.mjs`, and
  `scripts/release/verify-live.mjs` — no runbook drift.

## Out of scope

- Any change to `publish.yml`, `stage-approve.mjs`, `verify-live.mjs`, or the actual publish
  pipeline. This is documentation only.
- Migrating to OIDC trusted publishing (dropped by owner directive 2026-07-25). If the repo
  ever goes public and OIDC becomes desirable, file a fresh spec then.
- Enabling provenance (already correctly gated on `RT_NPM_PROVENANCE`; unchanged here).

## Done when

- SETUP.md, `manual-publish.mjs`, and every reader-facing doc/script that mentions the publish
  model describe token staging + 2FA approval; no instruction claims OIDC or "no `NPM_TOKEN`
  in CI".
- A `grep -n 'OIDC\|trusted publish' SETUP.md scripts/release/*.mjs` sweep is clean of active
  instructions to migrate to or use OIDC.
- This spec moves to `docs/done/`.
