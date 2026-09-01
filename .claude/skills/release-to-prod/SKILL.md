---
name: release-to-prod
description: Cut and publish a RunTypes release end-to-end — decide the bump, curate CHANGELOG.md, open the chore(release) PR into main, then promote main into prod with a MERGE-COMMIT pull request, watch every workflow, and fix failures forward via PRs into main. Use whenever the user wants to release, publish, cut/bump a version, promote main to prod, ship to npm, finish or unblock a release, or asks why a release workflow is red — even for just one phase (a bump PR, a promotion PR, a failed gate). The agent drives all PRs and CI watching, and merges every PR itself when the release is clean; if anything went red it fixes forward, gets back to green, then hands the final merge to the developer with a report of every fix applied.
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
workflow, diagnose failures, fix them with new PRs into `main`, and **merge the PRs**
under the rule below. **The developer:** runs the 2FA approval, dispatches the website
deploy, and makes the call on any release that needed fixing. Never push to `prod`
outside a PR, never push `v*` tags (CI owns them).

### When you merge, and when you ask

**Clean run → you merge.** If every check went green on the first attempt and you
applied no fixes, merge the PR yourself as soon as it is mergeable. Do not park a green
release waiting for a click.

**Anything went red → you fix, then ask.** If any check failed at any point in the
cycle, you fix it forward, re-cut, and drive it back to green — but you do **not** merge
the final promotion. Bring it to a ready-to-merge state and hand it over with a report:

- every failure, what caused it, and the fix that landed (PR number + one line each)
- the current check state, and that the PR is mergeable
- anything you deliberately did not fix, and why

The developer merges from there. The reasoning: a release that needed repair is a
release where someone should look at *what* was repaired before it ships to npm. A
clean one has nothing to review.

**Merge methods are not yours to choose** — into `main` rebase, into `prod` a merge
commit. Use the explicit flag so no default can bite you:

```bash
gh pr merge <n> --rebase        # any PR into main
gh pr merge <n> --merge         # the promotion PR into prod — merge commit, always
```

Never pass `--admin`, and never merge past a red **required** check. A red
*non-required* check is a judgement call: say plainly that it is red, why it is red,
and why it does not block, before merging. If you cannot explain it, ask.

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

`bump` also handles the ONE family that is not on the lockstep: the
`@mionjs/drizzle-orm-*-core` packages keep drizzle-orm's own `major.minor` and get a
patch bump ONLY when their published sources changed since their last bump. It prints
one line per package (`-> 0.45.1`, or "unchanged ... not republished") — read it, and
mention any bumped dialect package in the PR body. It aborts if the dialect versions or
peer ranges do not match the installed drizzle-orm; realign those on `main` first
(`pnpm rtx release check-drizzle-versions`).

Then curate the changelog **into the same commit** (the release commit is one commit:
version.json, every package.json the bump touched, CHANGELOG.md):

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
body = bump summary + changelog highlights). Watch the checks; address review feedback by
amending. When it is green and mergeable, **merge it yourself** with
`gh pr merge <n> --rebase` — this is a PR into `main`, so rebase, and the clean/red rule
above applies to the promotion in Phase 2, not to this one. A bump PR that needed a fix
is worth a line in the Phase-2 report, not a separate handoff.

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

Then apply the clean/red rule from **Roles**:

- **No fix was needed anywhere in the cycle** → merge it yourself,
  `gh pr merge <n> --merge`. Confirm afterwards that prod's new HEAD has two parents.
- **Anything went red** → leave it mergeable and hand it over with the report: each
  failure, its cause, the fix PR that landed, and the current check state. The developer
  merges.

The `prod` ruleset permits only `merge` as a merge method, so the wrong method cannot be
selected by either of you — but keep passing `--merge` explicitly rather than relying on
that.

### A red `fuzz soak` lane blocks the release

The soak lanes are the only place the fuzz budgets run with a varying seed, so the
gate is where latent bugs surface — including ones the release did not introduce.
**Every red soak lane blocks anyway.** There is no "it predates this version, ship
it" carve-out: the finding is real, it is reproducible from the seed the job
printed, and a release is the worst moment to start trusting an unfixed oracle
violation. Fix forward on `main` and re-cut, exactly as above.

**Never re-roll the seed to get green.** A second run on a fresh seed that passes is
not evidence the bug is gone, only that the new seed did not reach it — the lane
draws from a huge space and most draws miss any given defect. The green that counts
is the failing seed replayed after the fix (`MION_FUZZ_SEED=<seed> pnpm rtx core fuzz
<lane> --soak`, the command the job echoes on its first line).

Default to fixing the finding inside the cycle. Shipping without the fix is an
explicit developer decision, never an agent one: ask. Only if the developer
chooses to defer does it get a `docs/todos/` spec naming the lane, the seed and
the oracle before anything ships, and that spec is work still owed after the
release, not a way to close the finding out.

The way to stop paying for this at release time is to drain findings between
releases — `fuzz-soak.yml` runs the same twelve lanes on demand
(`gh workflow run fuzz-soak.yml`, or the Actions tab) for the cost of twelve short
jobs instead of the whole gate.

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
| `merge-shape` red | The PR was rebase- or squash-merged | Open a NEW `main → prod` PR and merge it with "Create a merge commit". If `main` has not moved since, it shows **zero file changes** — expected, and head=`main` passes `main-ancestor`. If GitHub reports a **conflict**, the empty merge is not available: use the forced-tree reunification below. No force-push either way. |
| publish preflight "already on npm" | Version bumped nowhere / re-run of an old version | Phase 1, then a new promotion PR. |
| Stage-approve interrupted | Some packages live, some staged | `pnpm rtx release stage-approve` again — it resumes leaves-first. |

### Forced-tree reunification (when `main → prod` conflicts)

Needed when a wrong-method merge is compounded by `main` being rewritten or moving on:
`prod` and `main` then share only an ancient merge-base, so the recovery PR is not empty
and cannot auto-merge. Resolving the conflict by hand is a trap — beyond the visible
`CHANGELOG.md` clash, files `main` *moved* (a `docs/todos/` spec promoted to
`docs/done/`) get **silently resurrected**, because the merge base predates them.

Build the merge commit locally with the tree forced to `main`'s, so both problems are
fixed by construction:

```bash
git fetch origin && git checkout prod && git reset --hard origin/prod
git merge --no-commit --no-ff origin/main || true     # conflict expected, do not resolve
git read-tree -u --reset origin/main                  # tree := main's tree, exactly
git -c core.hooksPath=/dev/null commit --no-edit      # hooks off: lint-staged would
                                                      # re-run pnpm and can rewrite files
[ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse origin/main^{tree})" ] && echo IDENTICAL
git log -1 --format='%P' | wc -w                      # must print 2
```

`prod` requires a PR (no bypass actors), so this cannot be pushed directly. Push it as a
branch and promote it:

```bash
git push origin HEAD:refs/heads/release/vX.Y.Z-reunify
gh pr create --base prod --head release/vX.Y.Z-reunify --title "release: vX.Y.Z (reunify prod ancestry)"
```

**`main-ancestor` will go red and cannot be made green** — the head is a merge commit, so
it does not live on `main`. It is not a required check, so it does not block; the
invariant it guards is satisfied by the identical tree. Verify after merging: prod's HEAD
has two parents, its tree equals `origin/main`'s, and `git merge-base --is-ancestor
origin/main origin/prod` succeeds.

## Hard rules (recap)

- Release PR = `release/vX.Y.Z` → `prod`; the head is a frozen branch cut from `main`, always an ancestor of `origin/main` (the `main-ancestor` gate). Delete it once the tag exists.
- **Never author a commit on the release branch, and never cherry-pick onto it.** To pull in a fix, land it on `main`, then re-cut the branch forward (`git branch -f` + `git push --force-with-lease`).
- Into `prod`: **merge commit only**. Into `main`: rebase only, as everywhere else.
- Never merge `prod` into `main`; never push to `prod` outside a PR; never push tags.
- Every fix lands on `main` first — `prod` receives it via a promotion.
- **A red `fuzz soak` lane blocks the release** — fix it forward, never re-roll the seed to get green; only the failing seed replayed clean counts.
- The changelog is curated, not raw generator output — and only ever prepended.
- **Clean release → you merge it. A release that needed any fix → you get it green, then the developer merges, with your report of every fix.** Explicit flags always: `--rebase` into `main`, `--merge` into `prod`. Never `--admin`, never past a red required check.
- Ruleset setup on `prod`: `allowed_merge_methods` is `["merge"]`, so rebase and squash are not offered at all — the guard rail that actually prevents the wrong-method merge, rather than catching it afterwards. Required checks are the gate jobs plus `version-fresh`. **Do not add `main-ancestor` to the required set:** it is the right check for a normal promotion but goes permanently red on a forced-tree reunification, which would leave a broken release line with no legal way to repair it.
