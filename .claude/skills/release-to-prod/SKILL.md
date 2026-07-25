---
name: release-to-prod
description: Cut and publish a RunTypes release end-to-end — decide the bump, curate CHANGELOG.md, open the chore(release) PR into main, then promote main into prod with a MERGE-COMMIT pull request, watch every workflow, and fix failures forward via PRs into main. Use whenever the user wants to release, publish, cut/bump a version, promote main to prod, ship to npm, finish or unblock a release, or asks why a release workflow is red — even for just one phase (a bump PR, a promotion PR, a failed gate). The agent drives all PRs and CI watching; the developer reviews and clicks the merges.
---

# Release to prod

Releasing means promoting `main` into `prod`. Merging a release PR into `prod` fires
[publish.yml](../../../.github/workflows/publish.yml): the full release gate, then it
**stages** every `@ts-runtypes/*` package to npm, tags `vX.Y.Z` on the prod commit, and
drafts the GitHub Release. Packages go **live** only after the maintainer's 2FA
stage-approval; the docs site deploys manually after that. Version source of truth is
[version.json](../../../version.json) (lockstep across all packages).

## Roles — who does what

**The agent (you):** decide the bump, write the changelog, open every PR, watch every
workflow, diagnose failures, and fix them with new PRs into `main`. **The developer:**
reviews PRs, clicks the merge buttons, runs the 2FA approval, dispatches the website
deploy. Never merge PRs yourself, never push to `prod`, never push `v*` tags (CI owns
them).

## The one rule that keeps releases mergeable

`prod` advances **only by true merge commits of `main`** — release PRs are landed with
**"Create a merge commit"**, never "Rebase and merge", never "Squash and merge".
`main` itself stays rebase-only as usual; the exception is only the PR *into prod*.

Why: a rebase/squash lands the same content as *copied* commits, so `main` stops being
an ancestor of `prod` — and the next release PR shows conflicts GitHub cannot merge
(this exact damage made the pre-0.10.0 releases need hand-built merge commits).
publish.yml's first job (`merge-shape`) fails fast on a wrong-method merge and prints
the recovery. Corollaries: never merge `prod` back into `main`; the release PR's head
is a frozen `release/vX.Y.Z` branch cut from `main` — always an ancestor of
`origin/main`, never carrying a commit that isn't already on `main`.

## Phase 0 — preflight

```bash
git checkout main && git pull origin main && git fetch origin prod
jq -r .version version.json                                   # current version
git log --oneline $(git merge-base origin/main origin/prod)..origin/main   # unreleased
```

Decide the bump from the unreleased commits (Conventional Commits): any `!` /
`BREAKING CHANGE` → **minor** while on 0.x (major on 1.x+); otherwise patch is this
repo's habit even for feature batches. When it is genuinely ambiguous, recommend one
and confirm with the user — the version is theirs to own.

## Phase 1 — bump PR into main

```bash
git checkout -b chore/release-X.Y.Z
pnpm rtx release bump X.Y.Z     # lockstep bump, commits chore(release): vX.Y.Z, tags locally
git tag -d vX.Y.Z               # ALWAYS delete the local tag — CI tags prod itself
```

Then curate the changelog **into the same commit** (the release commit is one commit,
six files: version.json, four package.json, CHANGELOG.md):

1. Generate the section (git-cliff is on PATH via `brew install git-cliff`; config is
   [cliff.toml](../../../cliff.toml)):
   `git-cliff $(git merge-base origin/main origin/prod)..HEAD --tag vX.Y.Z --strip all -o /tmp/section.md`
2. Curate it to match the existing entries' voice: hand-write the opening prose
   paragraph summarizing the release themes, enrich the important bullets with the
   "why", mark breaking changes `[**breaking**]` (including any the commit author
   forgot to mark with `!`), and drop internal noise (todo-filing docs commits, spec
   moves). Never regenerate the whole file — past intros are hand-written and a full
   `git-cliff -o CHANGELOG.md` would erase them.
3. Insert the section under the file header, above the previous release, then:
   `git add CHANGELOG.md && git commit --amend --no-edit`

Push, open the PR into `main` (`gh pr create --base main --title "chore(release): vX.Y.Z"`,
body = bump summary + changelog highlights), and tell the developer it merges the
normal way (**rebase**). Watch until it lands; address review feedback by amending.

## Phase 2 — release PR (release/vX.Y.Z → prod)

Once the bump is on `main`, cut a frozen release branch at that commit and open the PR
from it:

```bash
git fetch origin main
git branch release/vX.Y.Z origin/main        # cut at the bump commit (main's tip)
git push -u origin release/vX.Y.Z
gh pr create --base prod --head release/vX.Y.Z --title "release: vX.Y.Z" --body-file <body>
```

The head is `release/vX.Y.Z`, **not `main`** — a frozen snapshot, so the release scope
is fixed at the cut point. Nothing merged to `main` afterward joins the release unless
you re-cut the branch to include it. That is the whole point: it freezes scope, stops
the ~35-minute gate from restarting on every unrelated `main` push, and keeps the
curated changelog accurate.

The body: the changelog's prose intro, the notable changes, and — **always** — this
reminder for the developer, prominently at the top:

> ⚠️ **Merge this PR with "Create a merge commit"** — never Rebase, never Squash.
> `prod` must advance only by true merge commits of `main`; `publish.yml` fails fast
> otherwise.

[pre-publish.yml](../../../.github/workflows/pre-publish.yml) runs on the PR: the full
release gate, `version-fresh` (goes red if version.json is already live on npm —
meaning Phase 1 hasn't landed; finish it, then re-cut the branch), and `main-ancestor`
(goes red unless the head is an ancestor of `origin/main` — the frozen-prefix guard).

Watch the checks (`gh pr checks <n>` — poll or `--watch`). On a red job: read the logs
(`gh run view --job <id> --log`), diagnose, and **fix forward on `main`** — a normal
PR (branch off main → fix → review → rebase-merge), never a commit on the release
branch, never a branch off `prod`, never a direct push. When the fix lands on `main`,
**re-cut the release branch forward** to the `main` commit that contains it:

```bash
git fetch origin main
git branch -f release/vX.Y.Z origin/main     # or a specific main SHA that has the fix
git push --force-with-lease origin release/vX.Y.Z
```

The PR updates and the gate reruns. Deliberately **no cherry-picking onto the branch** —
a copied commit would land clean but put a non-`main` SHA into prod's ancestry;
re-cutting keeps the branch a literal prefix of `main` (and `main-ancestor` green).
Then hand the green PR to the developer to merge — with the merge-commit reminder.

## Phase 3 — publish, approve, deploy

The merge push fires publish.yml: `merge-shape` guard → full gate rerun →
stage-publish (`NPM_TOKEN`, unattended) → `vX.Y.Z` tag on prod → GitHub Release. Watch it:
`gh run list --workflow=publish.yml --limit 1`, then `gh run watch <id>`. Once the
`vX.Y.Z` tag exists the frozen branch has done its job — delete it:
`git push origin --delete release/vX.Y.Z`.

When it succeeds, hand the developer the finishing steps, in order:

1. `pnpm rtx release stage-approve` — asks for the 2FA OTP once (reused while its
   ~30s window lasts, re-prompted on expiry), approves leaves-first, then waits for
   npm to serve the new version and **auto-dispatches the website deploy**
   (`--no-deploy` to skip; `--deploy-only` to re-fire a skipped/failed dispatch).
2. Optionally `pnpm rtx release e2e --backend npm` — verifies the LIVE packages.
3. Only if step 1 reported `DEPLOY NOT TRIGGERED`: **Actions → "prod · deploy
   website" → Run workflow** on the **prod** ref (its `verify-live` guard aborts
   until the packages are live).

## When things go wrong

| Failure | Meaning | Recovery |
| --- | --- | --- |
| `version-fresh` red on the PR | version.json already published | Land the Phase-1 bump PR on main, then re-cut `release/vX.Y.Z` at a main commit that includes the bump. |
| `main-ancestor` red on the PR | The release head isn't a prefix of `main` (a commit was authored on the release branch) | Land the change on `main` via a normal PR, then re-cut the branch forward (`git branch -f release/vX.Y.Z origin/main && git push --force-with-lease`). Never commit on the branch. |
| Gate red (PR or publish run) | A real build/test/e2e problem | Fix forward on `main` (normal PR). PR-time: re-cut `release/vX.Y.Z` once the fix lands and the gate reruns. Post-merge: land the fix on main, re-cut the branch, open a fresh release PR and repeat Phase 2 (same version — nothing was staged). |
| `merge-shape` red | The PR was rebase- or squash-merged | Open a NEW `main → prod` PR — it shows **zero file changes**, which is expected (head=`main` passes `main-ancestor`, since `main` is its own ancestor) — and merge it with "Create a merge commit". The empty merge reunifies the histories; publish.yml reruns on it. No force-push. |
| publish preflight "already on npm" | Version bumped nowhere / re-run of an old version | Phase 1, then a new promotion PR. |
| Stage-approve interrupted | Some packages live, some staged | `pnpm rtx release stage-approve` again — it resumes leaves-first. |

## Hard rules (recap)

- Release PR = `release/vX.Y.Z` → `prod`; the head is a frozen branch cut from `main`, always an ancestor of `origin/main` (the `main-ancestor` gate). Delete it once the tag exists.
- **Never author a commit on the release branch, and never cherry-pick onto it.** To pull in a fix, land it on `main`, then re-cut the branch forward (`git branch -f` + `git push --force-with-lease`).
- Into `prod`: **merge commit only**. Into `main`: rebase only, as everywhere else.
- Never merge `prod` into `main`; never push to `prod` outside a PR; never push tags.
- Every fix lands on `main` first — `prod` receives it via a promotion.
- The changelog is curated, not raw generator output — and only ever prepended.
- One-time setup: the `prod` ruleset must require the `main-ancestor` check (`release head is an ancestor of main`) alongside the gate and `version-fresh`.
