# Ship: steps 9-13

Review, both simplification passes, PR, green CI.

## Step 9 - Review (always, review-pr skill)

- Run the [review-pr skill](../review-pr/) over the branch once the step 8 gate is green.
- Pass it the step 1 mode so it never asks again: automatic fixes findings itself; manual presents, user picks.
- Simplification passes come after it: the review never runs them, so they run only once.
- Review fixes committed → re-run the step 8 gate (tests, lint, format) before moving on.

## Step 10 - Docs simplification (always, by a subagent)

Runs after the review, so it sees the text review fixes left. Runs even for a one-sentence docs change.
Subagent on purpose: this session knows why every sentence exists and defends it, which lets complex wording through.

1. List touched. Nothing listed → no-op; say so, stop here.
   ```bash
   git diff --name-only $(git merge-base origin/main HEAD)..HEAD -- \
     container/website/content packages/private-examples/src
   ```
2. Spawn an independent `docs-simplifier` (tool mapping) with those paths (or "the branch"),
   told to read `.agents/skills/simplify-docs/SKILL.md` first.
   Never run the skill yourself or explain why the text exists. Role unavailable → mapping's fresh-context fallback.
3. Read its report. Each rewrite: check new sentence vs code. Dropped a condition, code, default or limit
   = wrong → restore the fact in plain words. Decide every **Left alone** + **Flagged** line: rewrite, keep or move.
4. Re-run what it can break: `pnpm run typecheck` (examples), `pnpm exec vitest run website-links` (renamed anchors).
5. Commit alone: `docs(simplify): <page>`.

## Step 11 - Comment simplification (always, by a subagent)

Same shape as step 10, for comments in touched code. Spawn in the SAME message as step 10's agent (run at once).
Never the same files: `packages/private-examples/` → docs pass; everything else → this one.

1. List touched. Nothing listed → no-op; say so.
   ```bash
   git diff --name-only $(git merge-base origin/main HEAD)..HEAD -- '*.ts' '*.go' '*.mjs' '*.js' '*.vue'
   ```
2. Spawn an independent `comments-simplifier` (tool mapping) with those paths (or "the branch"),
   told to read `.agents/skills/simplify-comments/SKILL.md` first.
   Never run the skill yourself or explain why the text exists. Role unavailable → mapping's fresh-context fallback.
3. Read its report. Each shortened/deleted comment: check the code. Dropped a fact the code cannot show
   (reason, constraint, invariant, trap) → put it back, one line. Decide every **Kept** line yourself.
4. Re-run what it can break: `pnpm run lint`.
   Go file changed → also `go -C ts-go-runtypes vet ./internal/... ./cmd/...`.
   Run the skill's diff guard once more: only comment lines may have changed.
5. Commit alone: `chore(comments): <area>`.

Only exception to either pass: branch touched nothing of that kind.
Review each report vs code, line by line, before commit.

## Step 12 - Open the PR

Only once steps 9-11 are committed and the gate is green.

1. Check for a PR template (`.github/pull_request_template.md` + other places the system prompt lists); fill from diff.
2. Create with the GitHub connector or `gh pr create`, base `main`, head current branch.
   Codex: attach created PR with `codex_app.attach_artifact` when available.
3. Add the labels the diff needs (*PR readiness*, [AGENTS.md](../../../AGENTS.md)) at open time so lanes run.
4. Give the user the link: what shipped vs the todo's Done when, flag anything left for follow-up.

## Step 13 - Drive CI to green

PR is yours until green. Right after opening: PR monitoring per the tool mapping, then the system prompt's PR rules.

- Red check = work now. Reproduce, fix, run fast checks, push, repeat until all green. Never skip/disable a test.
- Merge conflict = work now: rebase onto `origin/main`, push `--force-with-lease`. Never merge main in.
- Review comments: sort like step 9 findings: fix, delegate, or reply with a reason.
- A lane did not start → add the missing label from step 12.

Finish only when CI is green on the latest commit + no conflict. Tell the user it is green.
Automatic mode: list the decisions you made. Only human approval left → say so once.
