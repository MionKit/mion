# Staged npm publish + website-deploy split

**Status: DONE for the in-repo pipeline (triaged 2026-07-25).** The staged-publish +
deploy-split machinery shipped and is present in-tree: `publish.yml` stages every package
via `npm stage publish`, `scripts/release/publish-tarballs.mjs` has the stage path,
`scripts/release/stage-approve.mjs` + `rtx release stage-approve` drive the leaves-first 2FA
approval, `website-deploy.yml` is split out (`workflow_dispatch`, `environment: production`),
`post-publish.yml` verifies the live registry, `scripts/release/verify-live.mjs` guards the
deploy, and SETUP.md has the publishing runbook. The remaining work is EXTERNAL and has moved
to a new todo: **[docs/todos/staged-publish-first-release-and-oidc.md](../todos/staged-publish-first-release-and-oidc.md)**.

> ### ⚠️ Triage note (2026-07-25): the shipped auth model DIVERGED from this spec
>
> This spec's "What shipped" / "What remains" below describe a **pure-OIDC, no-`NPM_TOKEN`**
> staging model. **That is NOT what shipped.** The pipeline that actually landed **stages with
> `NPM_TOKEN`**, not OIDC:
>
> - `publish.yml:154-164` writes `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` and **hard-fails
>   if `NPM_TOKEN` is empty** — staging authenticates with the token (staging needs any token and
>   no 2FA; the 2FA gate is the *approval*, which is unchanged).
> - `id-token: write` is kept **only for optional provenance** (`RT_NPM_PROVENANCE`, off by
>   default because the repo is private), not for auth.
> - `scripts/lib/env.mjs:49` documents `NPM_TOKEN` as used by BOTH the local publish AND the CI
>   stage-publish — i.e. the token is a required, current input, not something being removed.
>
> So the OIDC-trusted-publisher migration and the `NPM_TOKEN`-deletion step were **planned but
> not completed**; a pragmatic token-staging model shipped instead. Everything below about
> "drops `NPM_TOKEN`" / "no `NPM_TOKEN` in CI" is stale plan text, kept for history.
>
> **Doc-vs-code contradiction to fix (carried into the new todo):** several docs still assert the
> unshipped OIDC-no-token model and contradict the code — `SETUP.md:366` ("no `NPM_TOKEN` in
> CI"), `SETUP.md:388` ("delete the `NPM_TOKEN` repo secret" — which would BREAK `publish.yml`),
> and `scripts/release/manual-publish.mjs:168` ("release stages via OIDC in CI"). These must be
> reconciled (finish the OIDC migration, or correct the docs to the token model).

**Created:** 2026-07-08
**Scope:** `.github/workflows/publish.yml` + `website-deploy.yml` (new), `scripts/release/publish-tarballs.mjs` + a new `stage-approve` helper, `SETUP.md` (publishing runbook), and one-time npmjs.com trusted-publisher config (external). No package/runtime code.

## What shipped (2026-07-08)

- [`scripts/release/publish-tarballs.mjs`](../../scripts/release/publish-tarballs.mjs) — no-`--registry` (CI/OIDC) path now runs `npm stage publish` with automatic provenance and NO `NPM_TOKEN`; the `--registry` path stays a plain `npm publish` for the local verdaccio e2e. Same leaves-first order.
- [`scripts/release/stage-approve.mjs`](../../scripts/release/stage-approve.mjs) (new) + `pnpm rtx release stage-approve [--dry-run]` — reads this version's pending stage-ids from `npm stage list --json`, sorts them leaves-first (same `rank()`), and drives `npm stage approve <id>` (2FA per id). Degrades to a printed by-hand runbook if the queue can't be read.
- [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml) — `publish-npm` drops `NPM_TOKEN`, keeps `id-token: write`, upgrades npm to ≥ 11.15.0, stage-publishes via the script, keeps the preflight + idempotent tag guard; `deploy-website` removed.
- [`.github/workflows/website-deploy.yml`](../../.github/workflows/website-deploy.yml) (new) — `workflow_dispatch` (optional `version` input, log only), `environment: production`, the old `deploy-website` job lifted verbatim.
- [`SETUP.md`](../../SETUP.md) → Publishing — staged-publish + OIDC model, the leaves-first 2FA approval runbook, the manual website-deploy step, and the external one-time setup. Env registry ([`scripts/lib/env.mjs`](../../scripts/lib/env.mjs)), `.env.sample`, and `rtx env publish-npm` messaging updated for the OIDC/manual-deploy model.

## What remains (external, one-time)

Cannot be done from the repo — a maintainer with npmjs.com admin must, **in order** (OIDC can't create a package that doesn't exist yet, so the first version of each package must be token-published before its trusted publisher can be registered):

1. **Bootstrap the first version with a token, locally** (`pnpm rtx release npm`) so all ten `@ts-runtypes/*` packages exist on npm.
2. Register the **trusted publisher** (repo `MionKit/ts-run-types`, workflow `publish.yml`) with **stage-only** permissions for **every** published package (`@ts-runtypes/core`, `@ts-runtypes/devtools`, `@ts-runtypes/bin`, and each `@ts-runtypes/binary-<os>-<arch>`), then confirm an OIDC run stages successfully.
3. Delete the `NPM_TOKEN` **repo secret** once OIDC is verified (CI no longer reads it; the local interactive publish still uses it from `.env`).

See [SETUP.md → Publishing](../../SETUP.md#publishing) for the full runbook.

> **Separate track** from the pre-publish e2e units (① [harness](../done/prepublish-e2e-1-harness.md), ② [feature matrix](../done/prepublish-e2e-2-feature-matrix.md)) — this touches the **publish pipeline**, not the e2e fixture, so it's **independent**. Ship as its own focused PR — earlier if publish-security is the more urgent need, otherwise after the e2e work. Highest real-world risk (a botched flow breaks an actual release) + external setup prerequisites, so keep it isolated.

## Context / the problem

Two coupled problems in the release pipeline:

1. **The npm publish credential requires 2FA**, which can't run unattended in CI —
   so an automated `npm publish` either needs a 2FA-exempt token (weaker) or can't
   run at all.
2. Adopting **staged publishing** (the fix for #1) means the current deploy gating
   in [`publish.yml`](../../.github/workflows/publish.yml) (`deploy-website`
   `needs: publish-npm`) would fire *before* the packages are approved/live.

This unit reworks publish + deploy around npm's two GA features so CI publishes
safely (no long-lived token) and a human approves with 2FA, then triggers the
deploy.

## Publish model — staged publishing + trusted publishing (OIDC)

This resolves the 2FA problem **without** weakening security or baking an
interactive-2FA token. Two GA npm features compose exactly for this:

- **Trusted Publishing (OIDC)** — npm ↔ GitHub trust via OIDC; **no `NPM_TOKEN`**.
  Short-lived per-workflow identity, automatic provenance. Needs npm ≥ 11.5.1 and
  `permissions: id-token: write` (the `publish-npm` job in
  [`publish.yml`](../../.github/workflows/publish.yml) already grants it). One-time
  npmjs.com config: register the trusted publisher (repo `MionKit/ts-run-types`,
  workflow `publish.yml`) **per published package**.
- **Staged publishing** — `npm stage publish` uploads to a **stage queue** and
  does **not** require 2FA, so CI can stage unattended. A maintainer then
  **approves** the staged version with a **live 2FA challenge** (npmjs.com queue
  or the npm CLI). The approval is "proof of presence" and **cannot** be done by a
  token, OIDC, or any non-interactive path — only a human 2FA. Needs npm ≥ 11.15.0
  / Node ≥ 22.14.0 (CI runs Node 26 — verify the bundled npm is ≥ 11.15.0; add
  `npm i -g npm@latest` if not).

Configure the trusted publisher with **stage-only permissions** (allow
`npm stage publish`, disallow `npm publish`). Then *every* CI publish is forced
through the stage queue → a maintainer must 2FA-approve before anything goes live.
This is npm's own recommended maximum-security posture and is exactly the
"publish to staged, then manually approve" the maintainer wants.

### Changes

| File | Change |
|------|--------|
| [`scripts/release/publish-tarballs.mjs`](../../scripts/release/publish-tarballs.mjs) | `npm publish` → `npm stage publish` (keep the dependency-safe order: binaries → launcher → FE). Provenance is automatic under OIDC — drop the explicit token auth (`authPublicRegistry`) for the CI/OIDC path; keep a `--registry` path for the local verdaccio e2e (which stays a plain publish into the throwaway registry, unaffected by staging). |
| [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml) `publish-npm` | Remove `NPM_TOKEN` (env + secret usage). Keep `id-token: write`. Run `npm stage publish` via the script. Keep the preflight (refuse to re-stage an existing version) + idempotent tag guard. **The GH `environment: release` reviewer gate becomes complementary** — the authoritative human gate is now npm's 2FA approval. |
| **Docs / runbook** | A new manual step: after the `publish-npm` job stages everything, a maintainer reviews the npm stage queue and approves with 2FA (npmjs.com or `npm stage`). Only then are the packages live; only then does the website deploy make sense. Document in `SETUP.md` → publishing. |
| Repo secrets | `NPM_TOKEN` can be deleted once OIDC is verified. Register the trusted publisher on npmjs.com for **each** package (`@ts-runtypes/core`, `-devtools`, `-bin`, and every `@ts-runtypes/binary-*`). |

### Stage-approval is per-package, NOT atomic — approve leaves-first (investigated 2026-07-08)

Confirmed against the [npm-stage CLI reference](https://docs.npmjs.com/cli/v11/commands/npm-stage/):
`npm stage approve`/`reject` take a **single `<stage-id>`** — there is **no
batch/group/atomic approval and no "release" grouping**. Each staged package is
independent, and **approving one publishes THAT package to the registry
immediately** ("Approve a staged package, publishing it to the npm registry").
Staging takes any token and no 2FA; **approving prompts for 2FA**
("The act of staging does not prompt for 2FA … the act of approving will").

⇒ So during a multi-package release the registry is briefly **partially live**
while you approve one id at a time, and the dependency-ordering concern is
**real** and must be in the runbook: **approve leaves-first, in the same order
[`publish-tarballs.mjs`](../../scripts/release/publish-tarballs.mjs) already
ranks** — every `@ts-runtypes/binary-<os>-<arch>` FIRST, then `@ts-runtypes/bin`
(launcher), then `@ts-runtypes/core` + `@ts-runtypes/devtools`. Approving the
launcher before its `binary-*` optional deps would open a window where a consumer
install resolves a launcher whose platform binary 404s.

**Helper (recommended):** a new `rtx release stage-approve` lists this version's
pending stage-ids sorted by that same `rank()` and drives `npm stage approve <id>`
in dependency order (npm prompts for the 2FA OTP per id). Turns "approve N ids in
the right order" into one guided, correctly-ordered pass instead of hand-copying
stage-ids from the npmjs.com queue.

### Deploy gating — split into a manually-triggered `website-deploy.yml` (decided 2026-07-08)

Staging breaks the current wiring: `deploy-website` does `needs: publish-npm`, but
under staging `publish-npm` finishing means **"staged," not "live"** — it would
deploy the site *before* the packages are approved. And **npm does not fire a
usable publish webhook** for this account/setup (checked by the maintainer), so an
automated go-live → deploy trigger is off the table.

**Decision: move the deploy into its own `website-deploy.yml`, triggered manually
from the GitHub Actions UI.**

- **NEW** `.github/workflows/website-deploy.yml`, `on: workflow_dispatch` (optional
  `version` input, for the deploy log only — the docs site builds from the repo,
  not from an installed npm version).
- `environment: production` (unchanged — it holds the `CLOUDFLARE_*` secrets, and
  its required-reviewer gate is the deploy guard).
- Steps: lift the existing `deploy-website` job verbatim — checkout (recursive
  submodules) → `bootstrap` → `pull-shared-image` → `pnpm rtx website build` →
  wrangler `pages deploy`.
- **Remove `deploy-website` from [`publish.yml`](../../.github/workflows/publish.yml).**
  The publish run now ends at "packages staged"; the maintainer approves the
  stage-ids (2FA, leaves-first), then clicks **Run workflow** on
  `website-deploy.yml`. One deliberate manual step, zero infra, no new secret.

Rejected alternatives, for the record: **(C) poll-until-live** (`npm view … until
it resolves` — hacky, still tied to the publish run) and **(A) npm-hook →
Cloudflare Worker → `repository_dispatch`** (ruled out — npm fires no usable
publish hook here; it would also have needed per-package debounce + a stored
GitHub token + a silent-failure fallback).

## Implementation notes

No open design decisions — these are external prerequisites to handle at build time:

- **npm CLI ≥ 11.15.0 on the Node 26 runners** (staged publishing requires it);
  add `npm i -g npm@latest` in the workflow if the bundled npm is older.
- **Register the trusted publisher on npmjs.com** (stage-only) for every package
  before the first stage-publish, and confirm OIDC works before deleting
  `NPM_TOKEN`.

## Acceptance criteria

- [x] `publish.yml` publishes with **no `NPM_TOKEN`** (OIDC), stages via
      `npm stage publish`, and a documented manual 2FA approval promotes to live.
- [ ] Trusted publisher registered on npmjs.com for every published package
      (stage-only permissions). — **external, pending** (see What remains).
- [x] `rtx release stage-approve` walks the pending stage-ids leaves-first.
- [x] Provenance still attached (automatic under OIDC) — `--provenance` kept on the
      OIDC path; live attestation verifiable only once the trusted publisher exists.
- [x] `website-deploy.yml` exists (`workflow_dispatch`, `environment: production`);
      `deploy-website` removed from `publish.yml`.
- [x] Docs updated: `SETUP.md` → publishing + the approval runbook.
- [x] On completion, `git mv` this spec to `docs/done/` (or `docs/partially/`).

## Sources

- npm staged publishing: <https://docs.npmjs.com/staged-publishing/> ·
  <https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/>
- npm trusted publishing (OIDC): <https://docs.npmjs.com/trusted-publishers/> ·
  <https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/>
</content>
