# Release recovery

Red release guards and broken `prod` ancestry: what each means and how to recover.

## When things go wrong

- `version-fresh` red on the PR = version.json already published.
  → Land the Phase 1 bump PR on main, then re-cut `release/vX.Y.Z` at a main commit that includes the bump.
- `main-ancestor` red on the PR = release head is not a prefix of `main` (a commit was authored on the release branch).
  → Land the change on `main` via a normal PR, then re-cut the branch forward
  (`git branch -f release/vX.Y.Z origin/main && git push --force-with-lease`). Never commit on the branch.
- Gate red (PR or publish run) = a real build/test/e2e problem. → Fix forward on `main` (normal PR).
  - PR-time: re-cut `release/vX.Y.Z` once the fix lands; the gate reruns.
  - Post-merge: land the fix on main, re-cut the branch, open a fresh release PR, repeat Phase 2
    (same version: nothing was staged).
- `merge-shape` red = the PR was rebase- or squash-merged.
  → Open a NEW `main → prod` PR, merge it with "Create a merge commit".
  - `main` not moved since → it shows **zero file changes**: expected, and head=`main` passes `main-ancestor`.
  - GitHub reports a **conflict** → empty merge not available: use the forced-tree reunification below.
  - No force-push either way.
- publish preflight "already on npm" = version bumped nowhere / re-run of an old version.
  → Phase 1, then a new promotion PR.
- Stage-approve interrupted = some packages live, some staged.
  → `pnpm miondevx release stage-approve` again: it resumes leaves-first.

## Forced-tree reunification (when `main → prod` conflicts)

- Needed when a wrong-method merge is compounded by `main` being rewritten or moving on.
- `prod` + `main` then share only an ancient merge-base: the recovery PR is not empty, cannot auto-merge.
- ⚠️ Resolving the conflict by hand is a trap. Beyond the visible `CHANGELOG.md` clash, files `main` *moved*
  (a `docs/todos/` spec promoted to `docs/done/`) get **silently resurrected**: the merge base predates them.
- Build the merge commit locally with the tree forced to `main`'s. Fixes both problems by construction:

```bash
git fetch origin && git checkout prod && git reset --hard origin/prod
git merge --no-commit --no-ff origin/main || true     # conflict expected, do not resolve
git read-tree -u --reset origin/main                  # tree := main's tree, exactly
git -c core.hooksPath=/dev/null commit --no-edit      # hooks off: lint-staged would
                                                      # re-run pnpm and can rewrite files
[ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse origin/main^{tree})" ] && echo IDENTICAL
git log -1 --format='%P' | wc -w                      # must print 2
```

- `prod` requires a PR (no bypass actors): cannot push directly. Push as a branch and promote it:

```bash
git push origin HEAD:refs/heads/release/vX.Y.Z-reunify
gh pr create --base prod --head release/vX.Y.Z-reunify --title "release: vX.Y.Z (reunify prod ancestry)"
```

- **`main-ancestor` goes red and cannot be made green**: head is a merge commit, so not on `main`.
- It is not a required check, so it does not block. The identical tree satisfies the invariant it guards.
- After merging, verify: prod's HEAD has two parents, its tree equals `origin/main`'s,
  and `git merge-base --is-ancestor origin/main origin/prod` succeeds.
