---
type: chore
spec: full-plan
status: ready
created: 2026-09-19
---

# Force-push the purged `main` and `prod` history

## Problem

`ts-go-runtypes/gen-run-type-kind`, a 3.2 MB `go build` output, was committed by
`de6a41cf7` (2026-08-08) and is untracked since, but the blob is still reachable
from `main` and `prod`, so every fresh clone downloads it. Its 8 side branches
were already rewritten and force-pushed. `main` and `prod` were rewritten too,
but GitHub refused the push with `GH013`, three rules at once: no force-push,
changes only through a pull request, and (on `main`) no merge commits, which the
rewritten history-join merges trip because they are new objects to the server.

Only the repository owner can lift those rules, so this is a one-off admin task.

## Plan

Run from a machine with `git filter-repo` (`pip install git-filter-repo`) and an
account that bypasses the `main` / `prod` rulesets (Settings → Rules → Rulesets:
add yourself to the bypass list, or disable the two rulesets for the minutes the
push takes, and put them back right after).

```bash
git clone --mirror https://github.com/MionKit/mion mion-mirror.git
cd mion-mirror.git
git config --unset remote.origin.mirror

# Every branch or tag that still holds the blob; expect main and prod only.
for r in $(git for-each-ref --format='%(refname)' refs/heads refs/tags); do
  git ls-tree -r "$r" --name-only | grep -qx ts-go-runtypes/gen-run-type-kind && echo "$r"
done

# Rewrite ONLY the commits after the one that added the blob, on those refs.
BASE=$(git rev-parse de6a41cf7^)
git filter-repo --invert-paths --path ts-go-runtypes/gen-run-type-kind \
  --refs $BASE..refs/heads/main $BASE..refs/heads/prod   # add any other ref the loop printed

# Must print 0 (refs/pull/* still hold it and cannot be pushed; GitHub drops them on its own gc).
git rev-list --branches --tags -- ts-go-runtypes/gen-run-type-kind | wc -l
git rev-list --count main   # same count as before the rewrite

git push --force origin refs/heads/main:refs/heads/main refs/heads/prod:refs/heads/prod
```

Do not run it without `--refs`: an unrestricted run also rewrites every commit,
tag and dead branch from before the blob (5355 of 6706 commits changed in a
trial), which is churn nothing needs and moves every release tag.

Then tell every clone holder: `git fetch origin && git reset --hard origin/main`
(same for `prod`), and rebase any local branch onto the new tip. Never merge the
old and new lines, that brings the blob back.

## Tests

No code changes. The proof is the last two commands above, plus a fresh
`git clone` afterwards whose `git rev-list --all -- ts-go-runtypes/gen-run-type-kind`
prints nothing.

## Done when

- `main` and `prod` on GitHub reference the blob from zero commits.
- A fresh clone is smaller than before (the trial measured 64.05 MiB → 62.25 MiB of packs).
- The rulesets are back in place.
- Clone holders have been told to reset.
