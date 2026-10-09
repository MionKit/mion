# Promote to prod

Phase 2 + Phase 3: frozen release PR into `prod`, gate green, merge or hand over, then publish.

## Phase 2: release PR

`release/vX.Y.Z` → `prod`. Bump on `main` → cut a frozen release branch at that commit, open the PR from it:

```bash
git fetch origin main
git branch release/vX.Y.Z origin/main        # cut at the bump commit (main's tip)
git push -u origin release/vX.Y.Z
gh pr create --base prod --head release/vX.Y.Z --title "release: vX.Y.Z" --body-file <body>
```

- Head = `release/vX.Y.Z`, **not `main`**: frozen snapshot, release scope fixed at the cut point.
- Nothing merged to `main` afterward joins unless you re-cut the branch to include it.
- Why: freezes scope, stops the ~35-minute gate restarting on every unrelated `main` push, keeps changelog accurate.
- Body: changelog prose intro, notable changes, and **always** this reminder for the developer, at the top:

> ⚠️ **Merge this PR with "Create a merge commit"**: never Rebase, never Squash.
> `prod` must advance only by true merge commits of `main`; `publish.yml` fails fast
> otherwise.

### Gate checks

[pre-publish.yml](../../../.github/workflows/pre-publish.yml) runs on the PR:

- the full release gate;
- `version-fresh`: red if version.json is already live on npm = Phase 1 not landed. Finish it, then re-cut the branch.
- `main-ancestor`: red unless the head is an ancestor of `origin/main` (the frozen-prefix guard).

### Red job → fix forward on main

- Watch: `gh pr checks <n>` (poll or `--watch`).
- Red job → read logs (`gh run view --job <id> --log`), diagnose.
- **Fix forward on `main`**: normal PR (branch off main → fix → review → rebase-merge).
- Never a commit on the release branch, never a branch off `prod`, never a direct push.
- Fix landed on `main` → **re-cut the release branch forward** to the `main` commit that contains it:

```bash
git fetch origin main
git branch -f release/vX.Y.Z origin/main     # or a specific main SHA that has the fix
git push --force-with-lease origin release/vX.Y.Z
```

- PR updates, gate reruns.
- **No cherry-picking onto the branch**: a copied commit lands clean but puts a non-`main` SHA into prod's ancestry.
  Re-cutting keeps the branch a literal prefix of `main` (and `main-ancestor` green).

### Merge or hand over

Apply the clean/red rule from [Roles](SKILL.md#when-you-merge-and-when-you-ask):

- **No fix needed anywhere in the cycle** → merge yourself: `gh pr merge <n> --merge`.
  Then confirm prod's new HEAD has two parents.
- **Anything went red** → leave it mergeable, hand over the report: each failure, its cause, the fix PR that
  landed, current check state. Developer merges.
- `prod` ruleset permits only `merge`, so neither of you can pick the wrong method. Still pass `--merge` explicitly.

## Phase 3: publish, approve, deploy

- Merge push fires publish.yml: `merge-shape` guard → full gate rerun → stage-publish (`NPM_TOKEN`, unattended)
  → `vX.Y.Z` tag on prod → GitHub Release.
- Watch: `gh run list --workflow=publish.yml --limit 1`, then `gh run watch <id>`.
- `vX.Y.Z` tag exists → frozen branch is done, delete it: `git push origin --delete release/vX.Y.Z`.
- Success → hand the developer the finishing steps, in order:
  1. `pnpm miondevx release stage-approve`: asks the 2FA OTP once (reused while its ~30s window lasts,
     re-prompted on expiry), approves leaves-first, waits for npm to serve the new version,
     then **auto-dispatches the website deploy** (`--no-deploy` skips; `--deploy-only` re-fires a skipped/failed one).
  2. Optional: `pnpm miondevx release e2e --backend npm` verifies the LIVE packages.
  3. Only if step 1 reported `DEPLOY NOT TRIGGERED`: **Actions → "prod · deploy website" → Run workflow**
     on the **prod** ref (its `verify-live` guard aborts until the packages are live).
