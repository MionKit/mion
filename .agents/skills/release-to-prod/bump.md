# Bump PR

Phase 0 + Phase 1: pick the version, land the lockstep bump + curated changelog on `main`.

## Phase 0: preflight

```bash
git checkout main && git pull origin main && git fetch origin prod
jq -r .version version.json                                   # current version
git log --oneline $(git merge-base origin/main origin/prod)..origin/main   # unreleased
```

- Decide bump from the unreleased commits (Conventional Commits).
- Any `!` / `BREAKING CHANGE` → **minor** while on 0.x (major on 1.x+).
- Otherwise patch: this repo's habit, even for feature batches.
- Genuinely ambiguous → recommend one, confirm with user. The version is theirs to own.

## Phase 1: bump PR into main

```bash
git checkout -b chore/release-X.Y.Z
pnpm miondevx release bump X.Y.Z     # lockstep bump, commits chore(release): vX.Y.Z, tags locally
git tag -d vX.Y.Z               # ALWAYS delete the local tag: CI tags prod itself
```

### Drizzle dialect packages

- `bump` also handles the ONE family off the lockstep: the `@mionjs/drizzle-orm-*-core` packages.
- They keep drizzle-orm's own `major.minor`. Patch bump ONLY when their published sources changed since last bump.
- Prints one line per package (`-> 0.45.1`, or "unchanged ... not republished"). Read it.
- Mention any bumped dialect package in the PR body.
- Aborts if dialect versions or peer ranges do not match installed drizzle-orm.
  → realign on `main` first (`pnpm miondevx release check-drizzle-versions`).

### Changelog

Curate it **into the same commit**. Release commit = ONE commit: version.json, every package.json the bump
touched, CHANGELOG.md.

1. Generate the section. git-cliff on PATH via `brew install git-cliff`. Config: [cliff.toml](../../../cliff.toml).
   `git-cliff $(git merge-base origin/main origin/prod)..HEAD --tag vX.Y.Z --strip all -o /tmp/section.md`
2. Curate to match existing entries' voice:
   - hand-write the opening prose paragraph summarizing release themes;
   - enrich important bullets with the "why";
   - mark breaking changes `[**breaking**]`, including ones the commit author forgot to mark with `!`;
   - drop internal noise (todo-filing docs commits, spec moves).
3. Never regenerate the whole file: past intros are hand-written, a full `git-cliff -o CHANGELOG.md` erases them.
4. Insert the section under the file header, above the previous release. Then:
   `git add CHANGELOG.md && git commit --amend --no-edit`

### Open + merge

- Push. Open PR into `main`: `gh pr create --base main --title "chore(release): vX.Y.Z"`.
  Body = bump summary + changelog highlights.
- Watch checks. Address review feedback by amending.
- Green + mergeable → **merge it yourself**: `gh pr merge <n> --rebase` (PR into `main` → rebase).
- The clean/red rule applies to the Phase 2 promotion, not this PR.
- Bump PR needed a fix → one line in the Phase 2 report, not a separate handoff.
