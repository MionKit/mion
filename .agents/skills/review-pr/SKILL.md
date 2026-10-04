---
name: review-pr
description: Review a PR or branch against this repo's rules in a fresh reviewer subagent, with no checklist approval, then fix the findings automatically or let the user pick. Use when asked to review a PR, branch or diff.
---

# review-pr

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Judge a change the way this repo judges one. **The review always runs in a `pr-reviewer` subagent**, never in the session that asked for it. That session asks the user which mode to run in, spawns the reviewer, fans the checklist groups out to one agent each, and then triages the findings. The checklist is never shown to the user for approval: only the findings are.

The split exists for one reason: the author's memory of why a line exists is exactly what talks a real finding out of a report. A reviewer that never wrote the code cannot make that mistake. So the reviewer reads the diff, builds the checklist and verifies the findings in a context that knows nothing but what is on disk. For the same reason each checklist group is checked by its own agent: a group that cannot see another group's work cannot talk its finding away.

**Documentation and comments are not the reviewer's job.** The `docs-simplifier` and `comments-simplifier` agents own them, each with its own rulebook and its own fresh context, and they run once, after the review and its fixes, so they see the final text. The review skill never runs them. The reviewer skips both.

The review produces a **findings report**, never edits.

This document has two halves. Read the one you are:

- **[Calling session](#calling-session)** - you were asked to review something. Five steps, and none of them is reviewing. Everything after the first question runs on its own.
- **[Reviewer](#reviewer)** - you are a `pr-reviewer` agent, in one of three roles: the checklist builder, a group checker, or the merger.

---

## Calling session

You do not review. You do not read the diff to "check" a finding, and you do not build the checklist. Doing any of it puts the context back that the split removed.

### 1. Ask the mode

Ask once with the available question tool, before anything else:

- **Automatic**: the whole review runs, and you decide what to fix and fix it, without asking again. The user gets a final summary.
- **Reviewed by you**: the whole review runs, you present every finding, and the user picks what to fix.

If the user already said which one in the request ("review it and fix what matters"), or the calling skill passed the mode, skip the question. In both modes the user never sees or approves the checklist.

### 2. Spawn the checklist reviewer

Spawn one independent `pr-reviewer` using the tool mapping, with the target and nothing else:

```
Review <the current branch against origin/main | branch <name> | PR #<n>>.
Follow the review-pr skill, the reviewer's half, from step 1.
No approval is coming: return the final checklist, one block per group.
```

Add anything the user said they are worried about, in their words. Do not add your own summary of the change: the reviewer reads it from disk, and your summary is the context the split exists to keep out.

If the named role is unavailable, use the fresh-context fallback in the tool mapping and instruct it to read this skill first.

### 3. Fan the groups out, one agent each

The checklist builder ends its first turn with the final checklist: the pinned merge-base, the intent, and one block per group. A user request that fits no group becomes group `U`. Spawn one `pr-reviewer` agent per group, all in **one message** so they run at once. Copy each group's block **verbatim**; copying is not editing. Nothing else goes in: no summary of the change, and no other group's items.

```
Check group <X> of the checklist for <the target>.
Follow the review-pr skill, the reviewer's half, role "Group checker".
Merge base: <sha>
Intent: <the intent paragraph, verbatim>
Items:
<the group's block, verbatim>
```

Each returns its answers and its verified findings. Relay nothing yet.

### 4. Send the group reports to the merger

Send every group report, whole and unedited, back to the **checklist reviewer** with SendMessage (a fresh Agent call would lose the context):

```
Group reports follow. Merge them into the report, step 7.
<every report, one after another>
```

It merges duplicates across groups and writes the one report. It is the merger because it built the list and already knows the change; the group agents do not.

### 5. Triage the report

The reviewer reports everything that survived verification. Never summarise or cut the report before the next step: a finding hidden by shortening is lost just like a deleted one.

**Reviewed by you.** Present **every** finding to the user, in the reviewer's order, then ask what to fix. You filter fixes, never findings. Do not recommend dropping any; recommending is fine, dropping is the user's call.

**Automatic.** You trim and decide, then fix, without asking. Read the code at each cited line first, then sort every finding into one of these:

- **Fix now**: it is right and related to this change. Fix it here, in this PR, with its own commit and its own test.
- **Delegate**: it is right but unrelated. Hand it to a parallel background agent through the [delegate-finding skill](../delegate-finding/). Never a backlog note.
- **Drop**: it is wrong, already fixed, or pure taste. Write down why, one line each.

**Read every nit for what it says, not what it is called.** Nits have turned out to hold real problems: a wrong name that hides a bug, a missing case, a rule broken in a small way. Treat the label as the reviewer's guess. A nit is dropped only after you read it and can say why it is wrong or why both readings are fine. When unsure, fix it.

When done, tell the user in a short summary: what you fixed, what you delegated, and each finding you dropped with its reason. Nothing is dropped silently.

If the user wants the findings on GitHub, post them as inline review comments, and resolve a thread only once it is actually fixed.

In reviewed mode, fixing is a separate step after the user picks. Do not fix before that.

### What the calling session must NOT do

- **Do not review.** Not before spawning, not "just the diff stat". Reading a finding's cited lines during triage is not reviewing: it is the caller's job.
- **Do not build or edit the checklist yourself.**
- **Do not drop a finding silently.** In reviewed mode only the user drops one. In automatic mode you drop only after reading it, and you list each drop with its reason.
- **Do not show the checklist to the user or ask them to approve it**, in either mode.
- **Do not start a new checklist reviewer** for the merge. SendMessage to the first one; the group agents are the only other reviewers.
- **Do not trim a group's block** when you fan it out, and do not hand one agent two groups.

---

## Reviewer

You are a `pr-reviewer` agent. You read, you judge, you report. You never edit, commit, or run tests.

The review runs in two halves, split over three roles. Your prompt says which one you are:

1. **Agree what to check.** The **checklist builder** builds one filtered list from the diff: the rules in the AGENTS.md files that govern the changed files, plus the general engineering checks those files do not cover. It hands the list back, grouped, with no approval step (steps 1 to 4).
2. **Check it.** One **group checker** per group works that group's items, verifies what it finds, and answers item by item (steps 5 and 6). The checklist builder, resumed as the **merger**, then turns the group reports into one report (step 7).

Why the list comes first: a review with no written scope reads as opinion, and nobody can tell what it skipped. A written list makes the review auditable and gives every finding a number to point at.

The bias throughout: **fewer committed lines**. A new type that could be derived, a new file that could be three lines in an existing one, an abstraction with one caller. Each of those is a finding.

**Documentation and comments are out of your scope, completely.** The `docs-simplifier` and `comments-simplifier` agents own them and run after the review. Build no items for either, and report nothing about a page, a doc block or a comment: not its wording, and not its absence.

Missing documentation is deliberately not a finding here. Documentation written beside a change comes out long and full of internals, so the simplify pass is built to cut rather than add, on purpose, against that bias. A reviewer asking for more pages pushes straight back the other way, and this repo would rather ship a feature undocumented than ship one over-documented by a reviewer who never has to read it again.

### The arc

1. **Scope** the change. One script does it. *(checklist builder)*
2. **Frame** it: read the spec and the PR description, write the intent. *(checklist builder)*
3. **Build** the review list, filtered to what this diff actually contains. *(checklist builder)*
4. **Hand it back** by group. *(checklist builder)*
5. **Check your group.** *(group checker)*
6. **Verify** every finding against the diff. *(group checker)*
7. **Merge and report** against the list. *(merger)*

### Step 1 - Scope

```bash
bash .agents/skills/review-pr/scope.sh [base-ref]
```

It prints the base ref and merge-base sha, the commits, the diff stat, the biggest added files, renames, the AGENTS.md files governing each changed path, any spec doc in the diff, the website pages touched, and which source areas changed with no test change.

**Pin the merge-base sha it prints.** Every group diffs `<merge-base>..HEAD` so the whole review sees one identical change set. Comparing against a moving `origin/main` makes upstream commits look like the author's work.

Picking the target:

- Nothing named: current branch against `origin/main`.
- A branch named: check it out or diff it, base still `origin/main`.
- A PR number named: read it with the available GitHub connector or `gh pr view` for the description, the base branch, **the labels** and the open review threads, fetch the head branch, then diff locally against that PR's own base.

Then **read the whole diff**: `git diff <merge-base>..HEAD`. On a large change read it area by area. You cannot build a real list, or verify a finding, about a change you have not seen.

### Step 2 - Frame: the spec and the description

Both are written before the code and often never updated. Treat them as claims to test, not as context to trust.

**Find the spec.** A file renamed out of `docs/todos/` into `docs/done/` in the diff is this PR's spec. No rename means either the spec is still in `docs/todos/` or there is no spec. Read the whole file, including its metadata header, `Done when` and `Out of scope`.

**Read the PR description and the labels**, when there is a PR. Labels gate CI lanes here, so note which ones are on it: a rule in the root AGENTS.md says which the diff needs, and the G group checks the two against each other. Reviewing a branch with no PR yet turns that into an item for when it opens.

Write the **intent**: one short paragraph saying what this change is meant to do. It heads the checklist and it heads the report, because a reviewer who loses the goal reports noise.

Do not judge the spec yet. It becomes items `S1` to `S4` on the list, checked in step 5 like everything else.

### Step 3 - Build the review list

The list is built fresh every review, from the files in front of you. Nothing is
carried over from a previous review or from memory.

**Start with the AGENTS.md files. They are the guidelines.** Read every one the
script named, in full, for every review, most specific last since it wins on
conflict. They evolve, so a rule you remember is a rule you are getting wrong.
Where one points at another document for an area this diff touches, follow the
pointer and read that too.

Turn them into items: the rules that could apply to these changed files, one line
each, quoting or closely paraphrasing the rule and naming the file it came from.
Drop rules for areas the diff does not touch, and say which areas you dropped.
Show the count per file so the coverage is visible:

```
AGENTS.md                        14 rules apply
packages/rpc-router/AGENTS.md         4 rules apply
ts-go-runtypes/AGENTS.md          2 rules apply   (Go files changed)
```

**Then top up from the catalog.** [global-checks.md](global-checks.md) holds the
ordinary engineering checks that no AGENTS.md covers, grouped and triggered. Add
the groups whose trigger the diff meets. It is the smaller half and it never
substitutes for reading the AGENTS.md files: where a catalog item and a repo rule
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
G2  [repo: AGENTS.md]                         Every new env var is registered and MION_ prefixed
T1  [global]                                  MethodIdCheck is not derivable from an existing type
B6  [global]                                  Every changed behaviour has a test that would fail without it
```

A repo rule about documentation or comments is not an item at all, whatever it
says: the two simplify agents own both, and a rule about a page belongs to
whoever is allowed to edit that page.

### Step 4 - Hand the checklist back

End your turn with the **final checklist**: the pinned merge-base, the intent, the per-file rule counts, the groups you dropped and why ("no C group, the diff adds no comments"), and one block per group, each holding only that group's items with their ids and sources. Anything the caller's prompt said worries the user goes in as items, in the user's words, in the group it fits or in its own group `U`. Nobody approves the list; the caller copies each block to its own group checker.

You never check items yourself. Steps 1 to 3 are reading and listing; step 4 is a full stop, and your next job is step 7.

### Step 5 - Check your group (group checker)

You get one group: its items, the merge-base and the intent. You did not build the list and you cannot see the other groups; that is the point. Read the diff (`git diff <merge-base>..HEAD`, area by area on a large change) and the spec if one is in it, then read your group's section of [groups.md](groups.md): what to read first, how to judge, and what a fail has to carry. A user group `U` has no section there: judge its items against the diff with the general rules below.

- **Check your items in order, and nothing else.** An item from another group is another agent's job.
- **Answer every item**: pass, fail, or not applicable. An item you skipped to come back to is an item that goes missing.
- **Re-read the rule.** For any item tagged `[repo: <file>]`, open that file and read the current wording before judging, then quote what you read. The checklist paraphrase is a pointer, not the rule.

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
- **Count what survived.** List every finding that passed verification and count them. An item that reported several findings contributes several.

End your turn with every item's answer, in the shape above, then the count. That message is your whole report; the merger turns it and the other groups' into one.

### Step 7 - Merge and report (merger)

You are the checklist builder again, now holding every group's report. You do not re-check items, and you do not re-judge a group's answer with another group's context: if group A called a new file unnecessary and group B shows its tests are thorough, that is two facts, not a retraction.

- **Merge duplicates, and only duplicates.** The T and A groups overlap by design, so the SAME finding at the SAME place often arrives twice: one entry, best evidence, both ids. Two findings that merely sit in one file, or come from one item, are two findings and stay two.
- **Count.** Add up the groups' counts and subtract only the merged duplicates. That number is what the report must contain.

Answer the list. Order by severity, not by group.

**Report every finding that survived step 6. Filtering is not yours to do.** A verified finding is dropped
only by the caller, who reads each one first. You do not get to leave one out because it is
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

- **Do not wait for approval of the checklist.** Hand it back and stop.
- **Do not check items as the checklist builder**, and do not check another group's items as a group checker.
- **Do not edit code.** This skill reviews. Fixes are the caller's job, after the report.
- **Do not filter the findings.** Every finding that survives verification goes in the report, each with its own entry. Summarising the list IS filtering it.
- **Do not run tests, builds or lint, and never report a test result you did not produce.** This review reads. The host is often not bootstrapped, and "tests pass" from an unbuilt host is a false claim. Reporting that a behaviour has no test is fine and expected.
- **Do not build the list from the catalog alone.** The AGENTS.md files are the guidelines; the catalog only covers what they do not.
- **Do not copy rules out of a AGENTS.md into this skill.** They are read per review, quoted from the file, and cited by file name.
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
- **A group that passes everything in a few lines skimmed.** Each group checker has one group and a fresh context, so there is no excuse: go back and read.
- **The merger is where findings go missing.** It holds many reports at once and the pressure to tidy is highest there. Merge only true duplicates, and check the count.
- **"But this feature has no docs" is not a finding.** It is the most tempting one to write and it is the one this review deliberately does not make. Leave it.
- **New file, low bar to question it.** Ask what it would cost to put the code in the file that already owns that job. Often nothing.
