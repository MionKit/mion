---
name: review-pr
description: Review a pull request or a feature branch against this repo's own bar before it lands. Use whenever the user says review this PR, review my branch, review my changes, review the diff, look over what I changed, is this ready to open, pre-PR check, or names a PR number or branch to review, even if they do not use the word review. It scopes the diff against the target branch, finds the todo spec behind it and checks the spec and PR description still match what shipped, then builds a filtered review list from the CLAUDE.md rules that govern the changed files plus the general engineering checks, gets that list approved, and runs it as parallel passes covering docs language, type and code reuse, a simpler shape with fewer committed lines, comments, and test coverage. It reports findings against the approved list and asks what to do next; it never edits code on its own.
---

# review-pr

Judge a change the way this repo judges one. The review runs in two halves:

1. **Agree what to check.** Build one filtered list from the diff: the rules in the CLAUDE.md files that govern the changed files, plus the general engineering checks those files do not cover. Show it to the user and get it approved.
2. **Check it.** Run the approved list as parallel passes, verify what they report, and answer against the list, item by item.

You produce a **findings report**, never edits. The user decides afterwards what gets fixed, delegated, posted or dropped.

Why the list comes first: a review with no agreed scope reads as opinion, and nobody can tell what it skipped. An approved list makes the review auditable, lets the user add or drop items before the work happens, and gives every finding a number to point at.

The bias throughout: **fewer committed lines**. A new type that could be derived, a new file that could be three lines in an existing one, a comment that repeats the line under it. Each of those is a finding.

## The arc

1. **Scope** the change. One script does it.
2. **Frame** it: read the spec and the PR description, write the intent.
3. **Build** the review list, filtered to what this diff actually contains.
4. **Approve** it with the user.
5. **Fan out** one pass per group, in parallel.
6. **Verify** every reported finding against the diff.
7. **Report** against the list, then ask what to do.

## Step 1 - Scope

```bash
bash .claude/skills/review-pr/scope.sh [base-ref]
```

It prints the base ref and merge-base sha, the commits, the diff stat, the biggest added files, renames, the CLAUDE.md files governing each changed path, any spec doc in the diff, the website pages touched, and which source areas changed with no test change.

**Pin the merge-base sha it prints.** Every pass diffs `<merge-base>..HEAD` so all of them see one identical change set. Comparing against a moving `origin/main` makes upstream commits look like the author's work.

Picking the target:

- Nothing named: current branch against `origin/main`.
- A branch named: check it out or diff it, base still `origin/main`.
- A PR number named: read it with `mcp__github__pull_request_read` for the description, the base branch, **the labels** and the open review threads, fetch the head branch, then diff locally against that PR's own base.

Then **read the whole diff yourself**: `git diff <merge-base>..HEAD`. On a large change read it area by area. You cannot build a real list, or verify an agent's finding, about a change you have not seen.

## Step 2 - Frame: the spec and the description

Both are written before the code and often never updated. Treat them as claims to test, not as context to trust.

**Find the spec.** A file renamed out of `docs/todos/` into `docs/done/` in the diff is this PR's spec. No rename means either the spec is still in `docs/todos/` or there is no spec. Read the whole file, including its metadata header, `Done when` and `Out of scope`.

**Read the PR description and the labels**, when there is a PR. Labels gate CI lanes here, so note which ones are on it: a rule in the root CLAUDE.md says which the diff needs, and the G group checks the two against each other. Reviewing a branch with no PR yet turns that into an item for when it opens.

Write the **intent**: one short paragraph saying what this change is meant to do. Every pass agent gets it, because a reviewer who does not know the goal reports noise.

Do not judge the spec yet. It becomes items `S1` to `S4` on the list, and you check those yourself in step 6, since you are the one who read it.

## Step 3 - Build the review list

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
container/website/CLAUDE.md       9 rules apply   (docs changed)
```

**Then top up from the catalog.** [global-checks.md](global-checks.md) holds the
ordinary engineering checks that no CLAUDE.md covers, grouped and triggered. Add
the groups whose trigger the diff meets. It is the smaller half and it never
substitutes for reading the CLAUDE.md files: where a catalog item and a repo rule
say the same thing, keep the repo rule and drop the catalog item, because the
repo rule is quotable and current.

Merge both into one list, grouped by the pass that will check it:

| Group | Covers | Pass owner |
| --- | --- | --- |
| S | spec and description | you, in step 6 |
| G | repo rules with no other home (dependencies, environment variables, commit and branch shape, build steps) | guidelines agent |
| D | documentation | docs agent |
| T | types and reuse | reuse agent |
| A | architecture and size | architecture agent |
| C | comments | comments agent |
| B | behaviour and tests | behaviour agent |

Number every item inside its group and tag its source, so a finding can point at
one line:

```
D4  [global]                                  Plain language, what it does for the reader
D9  [repo: container/website/CLAUDE.md]       Titles are Title Case and name the job
G2  [repo: CLAUDE.md]                         Every new env var is registered and MION_ prefixed
```

A repo rule about documentation goes in group D, not G, so the agent who reads
the docs is the one who checks it.

## Step 4 - Get the list approved

Show the whole list with the intent above it, plus the groups you dropped and why ("no C group, the diff adds no comments"). Then ask, with AskUserQuestion: run it as is, add items, or drop a group. Fold in what they say and re-show only if they changed something structural.

This is the moment the user steers the review. Take an added item seriously even when it is not in any rulebook: their attention is a signal about where this change is risky.

## Step 5 - Fan out

One agent per group that survived, all spawned in **one message** so they run at once, `subagent_type: general-purpose`. Briefs are in [passes.md](passes.md): paste the brief and fill in the merge-base sha, the intent, that group's approved items, and the paths.

Each agent gets **its items and nothing else**, checks them in order, and answers per item: pass, fail, or not applicable. Tell it to read the source file named on any repo item so it quotes the current text rather than your paraphrase. Tell it plainly: read only, no edits, no commits.

## Step 6 - Verify before you report

You check the `S` items yourself here, against the diff you read in step 1.

For everything the agents send back, nothing reaches the user unverified:

- **The citation is real.** Open the file at the cited line and check the code says what the finding claims.
- **The rule is real.** A repo-rule finding must quote the line it breaks, and you confirm that line exists. If it does not, drop it or relabel it as taste.
- **The simpler option is really simpler.** Does it remove more lines than it adds, and keep the behaviour? If you cannot show that, drop it.
- **It is in scope.** The change under review is the diff. A problem in untouched code is not this PR's finding; route it in step 7.
- **Merge duplicates.** The T and A groups overlap by design, so one finding often arrives twice. One entry, best evidence.
- **An off-list finding is welcome but marked.** An agent that spots something serious outside its items reports it flagged as off-list; keep it, and say it was not on the approved list.

## Step 7 - Report, then ask

Answer the list. Order by severity, not by group.

```markdown
## Review: <branch> vs <base>   (N files, +X / -Y lines)

**Verdict:** ready to open | fix these first (K blocking)
**List:** 34 items checked, 27 pass, 5 fail, 2 not applicable

### Blocking
1. **<one line claim>**  `path/file.ts:42`  [D9]
   Rule: <quoted line, with the file it came from>
   Fix: <the concrete, small change>

### Worth fixing
### Nits
### Off-list
### Checked clean
<ids only, one line>
```

Severity:

- **Blocking**: breaks a written rule, breaks behaviour, a fix or feature with no test, spec or docs contradicting the code, docs missing for a user-visible change.
- **Worth fixing**: reuse, simplification, wordy or internals-heavy docs, a comment that no longer matches the code.
- **Nit**: naming and phrasing where both readings are fine.

Then ask what to do. The root CLAUDE.md sets where a finding goes: related ones are fixed in this change, unrelated ones go to a parallel background agent through the [delegate-finding skill](../delegate-finding/), and nothing is left as a note. Follow it rather than inventing a third lane. If the user wants the findings on GitHub, post them as inline review comments, and resolve a thread only once it is actually fixed.

## What NOT to do

- **Do not start reviewing before the list is approved.** Steps 1 to 3 are reading and listing.
- **Do not edit code.** This skill reviews. Fixes happen after the user picks them, as their own step.
- **Do not run tests, builds or lint, and never report a test result you did not produce.** This review reads. The host is often not bootstrapped, and "tests pass" from an unbuilt host is a false claim. Reporting that a behaviour has no test is fine and expected.
- **Do not build the list from the catalog alone.** The CLAUDE.md files are the guidelines; the catalog only covers what they do not.
- **Do not skip re-reading a CLAUDE.md** because you read it earlier in this session or in a previous review. They change, and the list is only as current as the read behind it.
- **Do not copy rules out of a CLAUDE.md into this skill.** They are read per review, quoted from the file, and cited by file name.
- **Do not run a whole group the diff does not trigger.** An item that cannot apply produces noise and hides the ones that can.
- **Do not report a rule you cannot quote.** Cite the line or call it taste.
- **Do not review untouched code.** Being next to the diff is not being in it.
- **Do not rewrite the author's approach** when it works and breaks no rule. "I would have done it differently" is not a finding.
- **Do not trust the spec or the PR description** as a description of the change. They are the thing being checked.

## Gotchas

- **Reviewing in the session that wrote the code? Compact or start fresh first.** Everything this skill needs is on disk: the diff, the spec, the CLAUDE.md files. Implementation context adds nothing and costs something, because the author's memory of why a line exists is exactly what talks a real finding out of the report in step 6. The passes run in clean subagents either way, so the bias lands on you, not them. A fresh session is better than a compact; a compact is better than neither.
- **`origin/main..HEAD` is not the change.** Use the merge-base range from the script, or upstream commits show up as the author's work.
- **A spec that reads perfectly can still be stalled.** It was written before the code. Check it against the diff, not against itself.
- **The list is the deliverable of the first half.** If it is vague ("check the docs are good"), the pass will be vague too. Each item should be checkable against a line of the diff.
- **The docs group finds the most and gets argued with the most.** Quote the guideline and show the rewritten sentence. A concrete shorter sentence wins an argument that adjectives do not.
- **The docs style rules are written down and they move.** Read `container/website/CLAUDE.md` during the review, including the pages it says to read first. It also says which tools may touch that tree, which decides what a valid fix looks like.
- **New file, low bar to question it.** Ask what it would cost to put the code in the file that already owns that job. Often nothing.
