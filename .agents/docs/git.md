# Git workflow

Branches, rebases, pushes, review threads, release line. Read before a rebase, push, merge or release.
Commit message + linear-branch rules: root [AGENTS.md](../../AGENTS.md#commit--format).

## Branches

- Branch naming = convention, not a gate. Prefer `feature/<name>` (or `fix/`, `docs/`, `chore/`).
  A name handed over by a tool or session (`claude/`-prefixed included) is fine as-is, no renaming.
- PRs land via Rebase-and-merge. Keep every branch LINEAR (no merge commits)!

## Integrate upstream: rebase, never merge

`main` may be force-updated / history-rewritten.

```
git fetch origin main
git rebase origin/main            # resolve conflicts per replayed commit
git push --force-with-lease origin <branch>
```

- Stubborn branch won't rebase cleanly → linearize onto current `main` first:
  `git commit-tree $(git rev-parse HEAD^{tree}) -p origin/main` then `git reset --hard <new>`.
- Never `git merge main` into a feature branch. Rebase-merge replays your ORIGINAL commits one by one:
  a merged branch that looks `mergeable` still fails with "this branch cannot be rebased due to conflicts."
- Before pushing: `git log --oneline origin/main..HEAD` lists only your own commits, no merge commits.
- After any rebase: `git push --force-with-lease`, never plain `--force` (lease refuses if the remote moved).

## Review threads

- Resolve a PR review thread once you FIXED it, never before (GitHub `resolve_review_thread`).
  Reviewer then sees only what's still open.
- Push-backs (you disagree) + plain explanations (no code change) stay OPEN: reply with the reasoning,
  reviewer closes.

## Release line: the one exception

- `release/vX.Y.Z` → `prod` lands with "Create a merge commit", never rebase, never squash
  ([publish.yml](../../.github/workflows/publish.yml)'s `merge-shape` job enforces it).
- Release branch is frozen from `main`. `prod` is never merged back.
- Never author a commit on the release branch: fix on `main`, re-cut forward
  ([pre-publish.yml](../../.github/workflows/pre-publish.yml)'s `main-ancestor` job enforces it).
- Whole flow: [release-to-prod skill](../skills/release-to-prod/).
