---
name: release-to-prod
description: Cut + publish a release, bump to merge-commit promotion into prod, fixing CI. Use for any release/publish.
---

# Release to prod

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

- Release = promote `main` into `prod`.
- Release PR merged into `prod` → [publish.yml](../../../.github/workflows/publish.yml): full release gate,
  **stages** every `@mionjs/*` package to npm, tags `vX.Y.Z` on prod commit, drafts GitHub Release.
- Packages go **live** only after maintainer's 2FA stage-approval.
- Docs site deploys after that (dispatched, not by the merge).
- Version source of truth: [version.json](../../../version.json), lockstep across all packages.

## Roles

- **You (agent):** decide bump, write changelog, open every PR, watch every workflow, diagnose failures.
- You fix failures with new PRs into `main`, and **merge the PRs** per the rule below.
- **Developer:** runs 2FA approval, dispatches website deploy, decides on any release that needed fixing.
- Never push to `prod` outside a PR. Never push `v*` tags (CI owns them).

### When you merge, and when you ask

- **Clean run → you merge.** Every check green first attempt, no fixes applied → merge as soon as mergeable.
  Never park a green release waiting for a click.
- **Anything went red → you fix, then ask.** Any check failed at any point in the cycle → fix forward, re-cut,
  drive back to green. Do **not** merge the final promotion. Leave it ready-to-merge, hand over a report:
  - every failure, its cause, the fix that landed (PR number + one line each);
  - current check state, and that the PR is mergeable;
  - anything deliberately not fixed, and why.
- Developer merges from there. Why: a repaired release needs someone to look at *what* was repaired before npm.
- Merge methods are not yours to choose. Always pass the explicit flag so no default bites:
  - `gh pr merge <n> --rebase`: any PR into main.
  - `gh pr merge <n> --merge`: promotion PR into prod, merge commit always.
- Never pass `--admin`. Never merge past a red **required** check.
- Red *non-required* check = judgement call. Before merging, say plainly it is red, why, and why it does not block.
  Cannot explain it → ask.

## The one rule that keeps releases mergeable

- `prod` advances **only by true merge commits of `main`**: "Create a merge commit".
  Never "Rebase and merge", never "Squash and merge".
- `main` stays rebase-only. The exception is only the PR *into prod*.
- Why: rebase/squash lands *copied* commits → `main` stops being an ancestor of `prod`
  → next release PR shows conflicts GitHub cannot merge (pre-0.10.0 releases needed hand-built merge commits).
- publish.yml's first job `merge-shape` fails fast on a wrong-method merge and prints the recovery.
- Never merge `prod` back into `main`.
- Release PR head = frozen `release/vX.Y.Z` branch cut from `main`: always an ancestor of `origin/main`,
  never carrying a commit not already on `main`.

## Steps

1. Phase 0, preflight + pick bump → [bump.md](bump.md#phase-0-preflight).
2. Phase 1, bump PR into main (bump, changelog, `--rebase` merge) → [bump.md](bump.md#phase-1-bump-pr-into-main).
3. Phase 2, release PR `release/vX.Y.Z` → `prod`, gate, fix forward, merge or hand over
   → [promote.md](promote.md#phase-2-release-pr).
4. Red `fuzz soak` lane → [fuzz-soak.md](fuzz-soak.md). Read before calling any soak failure non-blocking.
5. Phase 3, publish, approve, deploy → [promote.md](promote.md#phase-3-publish-approve-deploy).
6. Any guard red or prod ancestry broken → [recovery.md](recovery.md).

## Hard rules (recap)

- Release PR = `release/vX.Y.Z` → `prod`. Head = frozen branch cut from `main`, always an ancestor of `origin/main`
  (the `main-ancestor` gate). Delete it once the tag exists.
- **Never author a commit on the release branch, never cherry-pick onto it.**
  Fix → land on `main`, re-cut the branch forward (`git branch -f` + `git push --force-with-lease`).
- Into `prod`: **merge commit only**. Into `main`: rebase only, as everywhere else.
- Never merge `prod` into `main`. Never push to `prod` outside a PR. Never push tags.
- Every fix lands on `main` first. `prod` gets it via a promotion.
- **Red `fuzz soak` lane blocks the release.** Fix forward, never re-roll the seed.
  Only the failing seed replayed clean counts.
- Changelog is curated, not raw generator output. Only ever prepended.
- **Clean release → you merge. Release that needed any fix → you get it green, developer merges with your report.**
- Explicit flags always: `--rebase` into `main`, `--merge` into `prod`.
- Never `--admin`, never past a red required check.
- `prod` ruleset: `allowed_merge_methods` is `["merge"]`, so rebase + squash are not offered at all.
  That is the guard rail that prevents a wrong-method merge, not just catches it after.
- Required checks on `prod`: the gate jobs + `version-fresh`.
- ⚠️ **Never add `main-ancestor` to the required set.** Right for a normal promotion, but permanently red on a
  forced-tree reunification → broken release line with no legal repair.
