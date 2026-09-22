---
name: review-pr
description: Review a PR or branch against this repo's rules in a fresh reviewer subagent, with an approved checklist, reporting findings and never editing. Use when asked to review a PR, branch or diff.
---

# review-pr

Judge a change the way this repo judges one. **The review always runs in a `pr-reviewer` subagent**, never in the session that asked for it. That session runs the two simplify passes first, spawns the reviewer, carries the checklist to the user, and afterwards decides what to fix.

The split exists for one reason: the author's memory of why a line exists is exactly what talks a real finding out of a report. A reviewer that never wrote the code cannot make that mistake. So the reviewer reads the diff, builds the checklist and verifies the findings in a context that knows nothing but what is on disk.

**Documentation and comments are not the reviewer's job.** The `docs-simplifier` and `comments-simplifier` agents own them, each with its own rulebook and its own fresh context, and they run before the review so their edits are in the diff the reviewer reads. The reviewer skips both.

The review produces a **findings report**, never edits.

This document has two halves. Read the one you are:

- **[Calling session](#calling-session)** - you were asked to review something. Four steps, and none of them is reviewing.
- **[Reviewer](#reviewer)** - you are the `pr-reviewer` agent. The whole method.

---

## Calling session

You do not review. You do not read the diff to "check" a finding, and you do not build the checklist. Doing any of it puts the context back that the split removed.

### 1. Run the two simplify passes first

Documentation and comments are reviewed by their own agents, not by the reviewer, and they are reviewed by editing. Run them before the review so the reviewer reads the diff as it will be merged, not a draft of it.

List what the branch touched:

```bash
git diff --name-only $(git merge-base origin/main HEAD)..HEAD -- container/website/content packages/examples/src
git diff --name-only $(git merge-base origin/main HEAD)..HEAD -- '*.ts' '*.go' '*.mjs' '*.js' '*.vue'
```

Spawn both agents in **one message** so they run at once, `subagent_type: docs-simplifier` and `subagent_type: comments-simplifier`, each with its own list of paths. They never touch the same files: `packages/examples/` belongs to the docs pass, everything else to the comments pass. An empty list means that pass is a no-op; say so and skip it.

Then do what those skills require of a caller, because neither agent commits its own work:

- Read each report and **check every rewrite against the code**. A simplification that dropped a condition, a code, a default or a limit is wrong, so restore the fact in plain words.
- Re-run what the passes can break: `pnpm run typecheck` and `pnpm exec vitest run website-links` for the docs pass, `pnpm run lint` and `go -C ts-go-runtypes vet ./internal/... ./cmd/...` for the comments pass.
- Commit each on its own: `docs(simplify): <page>` and `chore(comments): <area>`.

Only then spawn the reviewer. Reviewing before this leaves the reviewer judging prose that is about to change.

### 2. Spawn the reviewer

One agent, `subagent_type: pr-reviewer`, with the target and nothing else:

```
Review <the current branch against origin/main | branch <name> | PR #<n>>.
Follow the review-pr skill, the reviewer's half, from step 1.
```

Add anything the user said they are worried about, in their words. Do not add your own summary of the change: the reviewer reads it from disk, and your summary is the context the split exists to keep out.

If the agent type is not found (agent definitions load at session start), spawn `general-purpose` with the body of `.claude/agents/pr-reviewer.md` as the prompt plus the instruction to read this skill first.

### 3. Carry the checklist to the user

The reviewer stops after the checklist and hands it back. Its message is not shown to the user, so relay it **whole**: the intent, every item with its id and source, the per-file rule counts, and the groups it dropped with its reasons. Do not trim it, and do not judge it.

Then ask with AskUserQuestion: run it as is, add items, or drop a group. This is the moment the user steers the review, and an item they add matters even when no rulebook mentions it, because their attention is a signal about where the change is risky.

Send the answer back to the **same** agent with SendMessage, so it continues with its context intact:

```
Approved. Run the checklist.
```

or the amendments in the user's words. A fresh Agent call would start over and rebuild the list.

### 4. Triage the report

The reviewer reports everything that survived verification. **Relay all of it to the user.** You filter fixes, never findings: a finding the user never sees is one they can never decide about, and summarising the list hides findings just as effectively as deleting them.

Then decide what to do with each, with the user. The root [CLAUDE.md](../../../CLAUDE.md) sets where a finding goes, and it is not a menu:

- **Related to this change** - fix it here, in this PR, with its own commit and its own test.
- **Unrelated** - hand it to a parallel background agent through the [delegate-finding skill](../delegate-finding/). Never a backlog note.
- **You disagree** - say so to the user with the reason and let them settle it. Disagreeing is not the same as dropping.

If the user wants the findings on GitHub, post them as inline review comments, and resolve a thread only once it is actually fixed.

Fixes are a separate step, after the user picks them. Reviewing and fixing in one motion is how a review turns into a rewrite.

### What the calling session must NOT do

- **Do not skip the simplify passes**, and do not run either of them yourself. Each needs a context that did not write the prose, which is the same reason the review does.
- **Do not review.** Not before spawning, not to double-check a finding, not "just the diff stat". Checking a simplifier's rewrite against the code is not reviewing: it is the caller's job, and it is about facts, not style.
- **Do not build or edit the checklist yourself.** Amendments come from the user and go to the reviewer verbatim.
- **Do not drop a finding** because it is small, because you disagree, or because the report is long. That is the user's call.
- **Do not start a second reviewer** to continue after the checklist. SendMessage to the first one.

---

## Reviewer

You are the `pr-reviewer` agent. You read, you judge, you report. You never edit, commit, or run tests.

The review runs in two halves:

1. **Agree what to check.** Build one filtered list from the diff: the rules in the CLAUDE.md files that govern the changed files, plus the general engineering checks those files do not cover. Hand it back for approval.
2. **Check it.** Work the approved list one group at a time, verify what you find, and answer against the list, item by item.

Why the list comes first: a review with no agreed scope reads as opinion, and nobody can tell what it skipped. An approved list makes the review auditable, lets the user add or drop items before the work happens, and gives every finding a number to point at.

The bias throughout: **fewer committed lines**. A new type that could be derived, a new file that could be three lines in an existing one, an abstraction with one caller. Each of those is a finding.

**Documentation and comments are out of your scope, completely.** The `docs-simplifier` and `comments-simplifier` agents own them and ran before you, so their edits are in the diff you read. Build no items for either, and report nothing about a page, a doc block or a comment: not its wording, and not its absence.

Missing documentation is deliberately not a finding here. Documentation written beside a change comes out long and full of internals, so the simplify pass is built to cut rather than add, on purpose, against that bias. A reviewer asking for more pages pushes straight back the other way, and this repo would rather ship a feature undocumented than ship one over-documented by a reviewer who never has to read it again.

### The arc

1. **Scope** the change. One script does it.
2. **Frame** it: read the spec and the PR description, write the intent.
3. **Build** the review list, filtered to what this diff actually contains.
4. **Hand it back** and wait for approval.
5. **Work the groups**, one at a time.
6. **Verify** every finding against the diff.
7. **Report** against the list.

### Step 1 - Scope

```bash
bash .claude/skills/review-pr/scope.sh [base-ref]
```

It prints the base ref and merge-base sha, the commits, the diff stat, the biggest added files, renames, the CLAUDE.md files governing each changed path, any spec doc in the diff, the website pages touched, and which source areas changed with no test change.

**Pin the merge-base sha it prints.** Every group diffs `<merge-base>..HEAD` so the whole review sees one identical change set. Comparing against a moving `origin/main` makes upstream commits look like the author's work.

Picking the target:

- Nothing named: current branch against `origin/main`.
- A branch named: check it out or diff it, base still `origin/main`.
- A PR number named: read it with `mcp__github__pull_request_read` for the description, the base branch, **the labels** and the open review threads, fetch the head branch, then diff locally against that PR's own base.

Then **read the whole diff**: `git diff <merge-base>..HEAD`. On a large change read it area by area. You cannot build a real list, or verify a finding, about a change you have not seen.

### Step 2 - Frame: the spec and the description

Both are written before the code and often never updated. Treat them as claims to test, not as context to trust.

**Find the spec.** A file renamed out of `docs/todos/` into `docs/done/` in the diff is this PR's spec. No rename means either the spec is still in `docs/todos/` or there is no spec. Read the whole file, including its metadata header, `Done when` and `Out of scope`.

**Read the PR description and the labels**, when there is a PR. Labels gate CI lanes here, so note which ones are on it: a rule in the root CLAUDE.md says which the diff needs, and the G group checks the two against each other. Reviewing a branch with no PR yet turns that into an item for when it opens.

Write the **intent**: one short paragraph saying what this change is meant to do. It heads the checklist and it heads the report, because a reviewer who loses the goal reports noise.

Do not judge the spec yet. It becomes items `S1` to `S4` on the list, checked in step 5 like everything else.

### Step 3 - Build the review list

The list is built fresh every review, from the files in front of you. Nothing is
carried over from a previous review or from memory.

**Start with the CLAUDE.md files. They are the guidelines.** Read every one the
script named, in full, for every review, most specific last since it wins on
conflict. They evolve, so a rule you remember is a rule you are getting wrong.
Where one points at another document for an area this diff touches, follow the
pointer and read that too.

Turn them into items: the rules that could apply to these changed files, one line
each, quoting or closely paraphrasing the rule and naming the file it came from.
Drop rules for areas the diff does not touch, and say which areas you dropped.
Show the count per file so the coverage is visible:

```
CLAUDE.md                        14 rules apply
packages/router/CLAUDE.md         4 rules apply
ts-go-runtypes/CLAUDE.md          2 rules apply   (Go files changed)
```

**Then top up from the catalog.** [global-checks.md](global-checks.md) holds the
ordinary engineering checks that no CLAUDE.md covers, grouped and triggered. Add
the groups whose trigger the diff meets. It is the smaller half and it never
substitutes for reading the CLAUDE.md files: where a catalog item and a repo rule
say the same thing, keep the repo rule and drop the catalog item, because the
repo rule is quotable and current.

Merge both into one list, grouped:

| Group | Covers |
| --- | --- |
| S | spec and description |
| G | repo rules with no other home (dependencies, environment variables, commit and branch shape, build steps) |
| T | types and reuse |
| A | architecture and size |
| B | behaviour and tests |

Number every item inside its group and tag its source, so a finding can point at
one line:

```
G2  [repo: CLAUDE.md]                         Every new env var is registered and MION_ prefixed
T1  [global]                                  MethodIdCheck is not derivable from an existing type
B6  [global]                                  Every changed behaviour has a test that would fail without it
```

A repo rule about documentation or comments is not an item at all, whatever it
says: the two simplify agents own both, and a rule about a page belongs to
whoever is allowed to edit that page.

### Step 4 - Hand the checklist back

End your turn with the checklist as your whole message: the intent, every item with its id and source, the per-file rule counts, the groups you dropped and why ("no C group, the diff adds no comments"), and a closing line saying you are waiting for approval before you check anything.

The caller relays it to the user and sends back either an approval or amendments. Fold in what comes back and carry on from step 5. If the amendment is structural, re-show the changed part before you start.

Do not start checking while you wait. Steps 1 to 3 are reading and listing; step 4 is a full stop.

### Step 5 - Work the groups, one at a time

[groups.md](groups.md) holds the method for each group: what to read first, how to judge, and what a fail has to carry. Work the surviving groups in that file's order, and finish a group completely before opening the next one.

One group at a time is the rule, not a suggestion. The groups used to run as separate agents that could not see each other's work, and doing them in one context loses that. What replaces it is discipline:

- **Check a group's items in order, and nothing else.** An item from another group is that group's turn, not this one's.
- **Answer every item before moving on**: pass, fail, or not applicable. An item you skipped to come back to is an item that goes missing.
- **Never soften an earlier group's finding with a later group's context.** If group A called a new file unnecessary and group B then shows its tests are thorough, that is two facts, not a retraction.
- **Re-read the rule per group.** For any item tagged `[repo: <file>]`, open that file and read the current wording before judging, then quote what you read. Your paraphrase on the checklist is a pointer, not the rule.

Record each answer as you go, in this shape:

```
- id:     A5
  result: pass | fail | not-applicable
  where:  path/to/file.ts:LINE        (for a fail, and for a pass you had to work for)
  evidence: the exact line(s) from the diff
  reason: the quoted rule, or why it costs the reader
  fix:    the concrete smaller change, with the replacement text where short
  severity: blocking | worth-fixing | nit
  confidence: high | medium | low
```

Something serious that no item covers is welcome: record it as **off-list**, in the same shape. Do not pad it. Off-list is for real problems, not for things you would have written differently.

### Step 6 - Verify before you report

Nothing reaches the report unverified, including your own findings from an hour ago:

- **The citation is real.** Open the file at the cited line and check the code says what the finding claims.
- **The rule is real.** A repo-rule finding must quote the line it breaks, and you confirm that line exists. If it does not, drop it or relabel it as taste.
- **The simpler option is really simpler.** Does it remove more lines than it adds, and keep the behaviour? If you cannot show that, drop it.
- **It is in scope.** The change under review is the diff. A problem in untouched code is not this PR's finding; report it off-list and say so.
- **Merge duplicates, and only duplicates.** The T and A groups overlap by design, so the SAME finding at the SAME place often arrives twice: one entry, best evidence. Two findings that merely sit in one file, or come from one item, are two findings and stay two.
- **Count what survived.** Before writing the report, list every finding that passed verification, group by group, and count them. That count is what the report must contain. An item that reported several findings contributes several.

### Step 7 - Report

Answer the list. Order by severity, not by group.

**Report every finding that survived step 6. Filtering is not yours to do.** A verified finding is dropped
only by the user, and the caller is the one who asks them. You do not get to leave one out because it is
small, because it is the second one from the same item, because another finding is in the same file,
because the report is getting long, or because you privately disagree: disagreeing is what the severity
levels are for. If a finding is too small to write a line for, it was too small to verify, so it should
have gone in step 6.

Check the count before you send: the report's entries must equal the number you counted in step 6.
If the report has fewer, you dropped something, so go back and find it. Grouping several findings
into one bullet hides them just as effectively as deleting them, so give each its own entry with its
own id and location.

```markdown
## Review: <branch> vs <base>   (N files, +X / -Y lines)

**Verdict:** ready to open | fix these first (K blocking)
**List:** 34 items checked, 27 pass, 5 fail, 2 not applicable

### Blocking
1. **<one line claim>**  `path/file.ts:42`  [A5]
   Rule: <quoted line, with the file it came from>
   Fix: <the concrete, small change>

### Worth fixing
### Nits
### Off-list
### Checked clean
<ids only, one line>
```

Severity:

- **Blocking**: breaks a written rule, breaks behaviour, a fix or feature with no test, a spec contradicting the code.
- **Worth fixing**: reuse, simplification, a narrower type, a smaller shape.
- **Nit**: naming where both readings are fine.

Your final message is the report, nothing else. The caller decides what happens next.

### What the reviewer must NOT do

- **Do not start checking before the checklist is approved.** Steps 1 to 3 are reading and listing.
- **Do not edit code.** This skill reviews. Fixes happen after the user picks them, as their own step.
- **Do not filter the findings.** Every finding that survives verification goes in the report, each with its own entry. Summarising the list IS filtering it.
- **Do not run tests, builds or lint, and never report a test result you did not produce.** This review reads. The host is often not bootstrapped, and "tests pass" from an unbuilt host is a false claim. Reporting that a behaviour has no test is fine and expected.
- **Do not build the list from the catalog alone.** The CLAUDE.md files are the guidelines; the catalog only covers what they do not.
- **Do not copy rules out of a CLAUDE.md into this skill.** They are read per review, quoted from the file, and cited by file name.
- **Do not run a whole group the diff does not trigger.** An item that cannot apply produces noise and hides the ones that can.
- **Do not report a rule you cannot quote.** Cite the line or call it taste.
- **Do not review untouched code.** Being next to the diff is not being in it.
- **Do not rewrite the author's approach** when it works and breaks no rule. "I would have done it differently" is not a finding.
- **Do not trust the spec or the PR description** as a description of the change. They are the thing being checked.

## Gotchas

- **The reviewer is always a subagent, even when the caller did not write the code.** A session that has been reading this repo all day is not a fresh context either, and the rule is worth more than the exception.
- **`origin/main..HEAD` is not the change.** Use the merge-base range from the script, or upstream commits show up as the author's work.
- **A spec that reads perfectly can still be stalled.** It was written before the code. Check it against the diff, not against itself.
- **The checklist is the deliverable of the first half.** If it is vague ("check the types are sensible"), the check will be vague too. Each item should be checkable against a line of the diff.
- **A long report is not a failure mode; a short one hiding findings is.** The pressure to tidy peaks exactly when the groups did their job and came back with a lot. Twenty entries the user skims in a minute beat twelve they trust and act on, because the eight you cut are the ones nobody ever sees again. Every finding that survives verification is already worth a line: that is what surviving verification means.
- **The second finding under one item is the one that goes missing.** An item that reports two things reads as one thing by the time it reaches the report. Count per FINDING, never per item.
- **The middle groups are where fatigue shows.** One context runs all of them now, and the ones in the middle get the tired pass. If a group answers every item `pass` in a few lines, you skimmed it: go back.
- **"But this feature has no docs" is not a finding.** It is the most tempting one to write and it is the one this review deliberately does not make. Leave it.
- **New file, low bar to question it.** Ask what it would cost to put the code in the file that already owns that job. Often nothing.
