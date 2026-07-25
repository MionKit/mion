---
type: chore
spec: guidelines
status: ready
created: 2026-07-25
---

# Staged publish: first-release bring-up, OIDC migration, and doc reconciliation

## Origin

Split out of [docs/done/staged-npm-publish-and-deploy.md](../done/staged-npm-publish-and-deploy.md)
during the 2026-07-25 `docs/partially/` triage. The **in-repo** staged-publish + deploy-split
pipeline shipped and is verified in-tree. What remains is external (a maintainer-run first
release) plus an unfinished OIDC migration and a cluster of docs that describe a model the code
does not implement.

## Current shipped model (verified 2026-07-25) — token staging, NOT OIDC

The pipeline that actually landed stages with `NPM_TOKEN`; it does **not** use OIDC trusted
publishing for auth:

- `publish.yml` (`publish-npm` job) writes `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` to
  `~/.npmrc` and **hard-fails when `NPM_TOKEN` is empty** (`.github/workflows/publish.yml:154-164`).
  It runs `node scripts/rt.mjs release tarballs` → `npm stage publish` per package. Staging needs
  any token and no 2FA; the 2FA gate is the *approval* step.
- `id-token: write` is granted **only for optional provenance** (`RT_NPM_PROVENANCE`, a repo
  variable, OFF by default because the source repo is private) — not for authentication
  (`publish.yml:101-110`).
- `scripts/lib/env.mjs:49` lists `NPM_TOKEN` (scope `secret`, task `publish-npm`) as used by BOTH
  the local interactive publish and the CI stage-publish — a required current input.
- `scripts/release/publish-tarballs.mjs` stages leaves-first (binary-\* → bin → FE);
  `scripts/release/stage-approve.mjs` (`pnpm rtx release stage-approve`) walks the pending
  stage-ids in the same `rank()` order, prompts for the 2FA OTP once and reuses it within its
  window, then auto-dispatches `website-deploy.yml` once npm serves the version.
- `scripts/release/verify-live.mjs` (`rtx release verify-live`) guards the deploy: it aborts unless
  the checked-out tree matches the live npm release across all `@ts-runtypes/*` packages.

## Work item 1 — first-release bring-up (external, one-time; pipeline has never run green)

The whole publish → stage → approve → live → deploy path has **never completed end-to-end in CI**.
A maintainer with npmjs.com admin must, in order:

1. **Bootstrap the first version with a token, locally** (`pnpm rtx release npm`) so all ten
   `@ts-runtypes/*` packages exist on npm (`@ts-runtypes/core`, `-devtools`, `-bin`, and each
   `@ts-runtypes/binary-<os>-<arch>`). Staging/approving a version of a package that does not yet
   exist is not possible.
2. **Run one CI release** (merge a version-bump PR to `prod`): confirm `publish.yml` stages all
   packages, tags, and drafts the GitHub Release.
3. **Approve leaves-first with 2FA** via `pnpm rtx release stage-approve`; confirm the packages go
   live and the auto-dispatched `website-deploy.yml` deploys (or dispatch it manually from the
   `prod` ref).
4. **Run `post-publish.yml`** (manual `workflow_dispatch`) to verify the live bytes on the real
   registry — the per-OS platform-binary optional-dep chain in particular.

This is a runbook exercise, not a code change; capture any real failures it surfaces as their own
todos (this is the "further downstream failures tracked separately" the website-suite spec warned
about, applied to the publish half).

## Work item 2 — decide + finish (or drop) the OIDC trusted-publishing migration

The original spec's end state was: OIDC trusted publishing per package (stage-only), publish.yml
authing via OIDC with no token, and the `NPM_TOKEN` repo secret deleted. That did NOT ship. Decide
with the owner which way to go:

- **Finish OIDC:** register the trusted publisher (repo `MionKit/ts-run-types`, workflow
  `publish.yml`, stage-only) for every published package once they exist (work item 1 step 1);
  then make `publish.yml` NOT require `NPM_TOKEN` (drop the `~/.npmrc` token write + the empty-token
  guard so the npm CLI performs the OIDC exchange itself); verify one OIDC staged run; then delete
  the `NPM_TOKEN` **repo** secret (the local `.env` token stays for the interactive publish). Note:
  npm refuses provenance from a private repo, so provenance stays gated on `RT_NPM_PROVENANCE` until
  the repo is public.
- **Or keep token staging** as the intended model and treat OIDC as future/when-public.

Whichever is chosen, the docs in work item 3 must be made to match it.

## Work item 3 — reconcile the doc-vs-code contradiction (fixable now, regardless of item 2)

Several docs assert the unshipped OIDC-no-token model and directly contradict the code. At minimum
correct them to the token model (or update them as part of finishing OIDC in item 2):

- `SETUP.md:366` — "there is **no `NPM_TOKEN`** in CI" (false; publish.yml requires it).
- `SETUP.md:388` — "delete the `NPM_TOKEN` **repo secret**" (following this today would break
  `publish.yml`, which hard-fails without it).
- `SETUP.md:354` / `:362` / the "Releasing through CI" heading — framed as OIDC; adjust to reflect
  token staging + 2FA approval as the security gate.
- `scripts/release/manual-publish.mjs:168` — prints "release stages via OIDC in CI"; should say the
  CI stages with `NPM_TOKEN`.

## Done when

- The first real release has gone green end-to-end (stage → 2FA approve → live → post-publish
  verify → website deploy), OR the specific failures it hit are filed as their own todos.
- A decision is recorded (finish OIDC vs keep token staging), and the code matches it.
- No doc or script message claims a publish model the code does not implement — `SETUP.md`,
  `manual-publish.mjs`, and this repo's env docs all agree with `publish.yml` + `scripts/lib/env.mjs`.
