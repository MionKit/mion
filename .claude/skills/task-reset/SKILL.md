---
name: task-reset
description: Reset the workspace to start a fresh task in the same shell session — switches to main, pulls the latest HEAD, asks for a new branch name, creates the branch, optionally deletes the merged old branch, and asks whether to compact context. Use when finishing a task and starting a new one without paying the (expensive) cold-boot cost. Triggers: "task reset", "new task", "next task", "start fresh task", "/task-reset".
---

# task-reset

Reset git state for a new task while keeping the existing build environment intact. Cold-bootstrapping this repo is expensive (Go toolchain build of `mion-bin/mion`, `ts-go-runtypes/third_party/tsgolint` + nested `microsoft/typescript-go` submodules, the patched `git am` step, `pnpm install` with the 30-day minimum-release-age policy). The point of `/task-reset` is to reset *only* git state and skip all of that.

PRs in this repo are **rebased** into `main`, so when an old task's PR lands, `main` ends up containing commits with the same content as the old branch but with **different SHAs**. Plan accordingly when deciding whether to delete the old branch.

## What to do

Execute these steps in order. If anything looks off (dirty tree, detached HEAD, non-fast-forward on `main`, unpushed commits on the old branch), STOP and surface it to the user before continuing — do not silently stash, discard, or force-reset.

### 1. Capture current state

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Remember the old branch name from step 1's output — you'll use it again in step 3. If the working tree is dirty, ask the user how to handle it before going further (commit, stash, discard — the user decides).

If you're already on `main`, skip ahead to step 4; there is no old branch to delete.

### 2. Switch to main and pull latest

```bash
git checkout main
git pull --ff-only
```

If `git pull --ff-only` fails because `main` has diverged locally, STOP. Do NOT run `git reset --hard origin/main` without explicit user confirmation — diverged local `main` usually means someone committed to it by mistake and that work might be worth salvaging.

### 3. Decide whether the old branch was merged (and optionally delete it)

Skip this step if step 1 said you were already on `main`.

Because PRs are rebased, `git branch --merged main` will NOT list the old branch — its commit SHAs no longer exist on `main`. You have to compare commit *messages* instead:

```bash
git log <old-branch> --oneline -10
git log main --oneline -20
```

If every commit subject on `<old-branch>` has a matching subject on `main` (and the old branch is not ahead with new uncommitted work), the branch has landed. Confirm with the user before deleting — then:

```bash
git branch -D <old-branch>
```

Use `-D` (not `-d`): rebase changes SHAs, so `-d` will refuse with "not fully merged" even when the work clearly landed.

If you're not certain the branch is merged, **leave it alone**. The cost of an orphan branch is zero; the cost of nuking unmerged work is high.

### 4. Ask the user for the new task / branch name

Use the **AskUserQuestion** tool. If recent conversation gives you a plausible task description, propose 2–3 kebab-case branch names as options (the user can always pick "Other"). Otherwise just ask the open question.

Example shape:

- question: "What's the name for the new task / branch?"
- header: "Branch name"
- options: (suggestions inferred from context, kebab-case) — or skip options and rely on "Other" if nothing reasonable can be inferred

### 5. Create the new branch from fresh main

```bash
git checkout -b <new-branch-name>
git rev-parse HEAD
git rev-parse main
```

The last two SHAs MUST match — that confirms the new branch starts at fresh `main`.

### 6. Ask whether to compact context

Use **AskUserQuestion** to ask whether the user wants to compact the conversation now that the previous task is done:

- question: "Run /compact to compact the conversation context now?"
- header: "Compact?"
- options:
  - "Yes — I'll run /compact"
  - "No, keep current context"

**`/compact` is a user-invoked slash command — you cannot invoke it via Skill, Bash, or any tool.** If the user picks yes, tell them to type `/compact` themselves. Do not try to call it.

## What NOT to do

- Do NOT run `pnpm install` — `node_modules/` is already in place and the policy file ([pnpm-workspace.yaml](../../../pnpm-workspace.yaml)) makes fresh resolves slow and fragile.
- Do NOT rebuild `mion-bin/mion` — it's already built; the old branch produced it and the file is gitignored.
- Do NOT touch `ts-go-runtypes/third_party/` — submodules and their patches stay exactly as they are. `.gitmodules` has `ignore = dirty` for `ts-go-runtypes/third_party/tsgolint`, so changes there are invisible to `git status` and easy to lose.
- Do NOT run `pnpm run clean` — it is a HARD clean (node_modules, `bin/`, dists, caches, bench data) and defeats the point of the skill.
- Do NOT force-push, force-reset, or `git clean -fd` without explicit user confirmation.

## Gotchas

- **Rebased PRs leave orphaned local branches with stale SHAs.** `git branch --merged main` will NOT list them. Always compare by commit *subject*, not SHA, when deciding to delete.
- **Don't conflate "PR merged on GitHub" with "branch safe to delete locally."** The PR may have been rebased to land a small fixup that isn't on your local copy. When in doubt, leave the branch.
- **`/compact` must be user-typed.** Asking via AskUserQuestion is the only thing you can do — don't try to call `/compact` from a tool.
- **The Go binary at `mion-bin/mion` belongs to the previous branch's source.** If the new task touches Go code under [cmd/](../../../cmd/) or [internal/](../../../internal/), the standard rebuild step from [CLAUDE.md](../../../CLAUDE.md) still applies — but only when that task actually edits Go, not as part of `/task-reset` itself.
