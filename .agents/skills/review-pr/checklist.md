# Checklist builder: steps 1-4

Build one filtered list from the diff: rules of the AGENTS.md files governing the changed files,
plus the general checks those do not cover. Hand it back grouped. No approval step.

## Step 1 - Scope

Run `bash .agents/skills/review-pr/scope.sh [base-ref]`. It prints:

- base ref + merge-base sha, commits, diff stat, biggest added files, renames;
- AGENTS.md files governing each changed path, spec doc in the diff, website pages touched;
- source areas changed with no test change.

⚠️ Pin the merge-base sha it prints. Every group diffs `<merge-base>..HEAD`: one identical change set.
`origin/main..HEAD` is not the change: a moving `origin/main` makes upstream commits look like the author's.

Target:

- Nothing named → current branch vs `origin/main`.
- Branch named → check it out or diff it, base still `origin/main`.
- PR number → read it (GitHub connector or `gh pr view`): description, base branch, **labels**, open review threads.
  Fetch head branch, diff locally vs that PR's own base.

Then read the whole diff: `git diff <merge-base>..HEAD`. Large change → area by area.
No real list, no verified finding, about a change you have not seen.

## Step 2 - Frame: spec + description

Both written before the code, often never updated. Claims to test, not context to trust.
A spec that reads perfectly can still be stale: check it against the diff, not against itself.

- **Spec**: a file renamed `docs/todos/` → `docs/done/` in the diff is this PR's spec.
  No rename → spec still in `docs/todos/`, or no spec. Read it whole: metadata header, `Done when`, `Out of scope`.
- **PR description + labels** (when a PR exists). Labels gate CI lanes: note them.
  Root AGENTS.md rule says which the diff needs; G group checks the two against each other.
  Branch with no PR yet → that becomes an item for when it opens.
- Write the **intent**: one short paragraph, what the change is meant to do. Heads checklist + report
  (a reviewer who loses the goal reports noise).
- Do not judge the spec yet: it becomes items `S1` to `S4`, checked in step 5.

## Step 3 - Build the list

Fresh every review, from the files in front of you. Nothing carried from a past review or memory.

1. **AGENTS.md files = the guidelines.** Read every one the script named, in full, every review.
   Most specific last (wins on conflict). They evolve: a remembered rule is a wrong rule.
   One points at another doc for an area this diff touches → read that too.
2. Turn them into items: rules that could apply to these files, one line each, quoting or closely
   paraphrasing, naming the source file. Drop rules for untouched areas; say which areas dropped.
3. Show count per file:
   ```
   AGENTS.md                        14 rules apply
   packages/rpc-router/AGENTS.md         4 rules apply
   ts-go-runtypes/AGENTS.md          2 rules apply   (Go files changed)
   ```
4. Top up from [global-checks.md](global-checks.md): ordinary checks no AGENTS.md covers.
   Add the groups whose trigger the diff meets.
   Smaller half, never a substitute. Catalog item + repo rule say the same → keep repo rule (quotable, current).
5. Merge into one list, grouped:
   - S: spec and description.
   - G: repo rules with no other home (dependencies, env vars, commit + branch shape, build steps).
   - T: types and reuse. A: architecture and size. B: behaviour and tests.
6. Number items inside the group, tag the source, so a finding points at one line:
   ```
   G2  [repo: AGENTS.md]                         Every new env var is registered and MION_ prefixed
   T1  [global]                                  MethodIdCheck is not derivable from an existing type
   B6  [global]                                  Every changed behaviour has a test that would fail without it
   ```

- A repo rule about docs or comments is never an item, whatever it says: simplify agents own both,
  and a rule about a page belongs to whoever may edit that page.
- Never copy rules out of an AGENTS.md into this skill: read per review, quoted from the file, cited by name.
- Never run a whole group the diff does not trigger: an item that cannot apply hides ones that can.
- Each item checkable against a line of the diff. Vague item ("types are sensible") → vague check.

## Step 4 - Hand the checklist back

End your turn with the final checklist:

- pinned merge-base, intent, per-file rule counts;
- groups dropped + why ("no C group, the diff adds no comments");
- one block per group: only its items, ids + sources;
- user worries from the caller's prompt, in the user's words: in the group they fit or own group `U`.

Never wait for approval: hand it back and stop. Caller copies each block to its own group checker.
Never check items yourself. Steps 1-3 = reading + listing; step 4 = full stop. Next job: step 7.
