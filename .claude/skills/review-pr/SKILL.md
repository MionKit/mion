---
name: review-pr
description: Review a pull request or a feature branch against this repo's own bar before it lands. Use whenever the user says review this PR, review my branch, review my changes, review the diff, look over what I changed, is this ready to open, pre-PR check, or names a PR number or branch to review, even if they do not use the word review. It diffs against the target branch, finds the todo spec behind the change and checks whether the spec and the PR description still match what shipped, reads every CLAUDE.md governing the changed files and verifies each rule, checks the website docs for plain language, hunts for new types and functions that could reuse something existing, looks for a simpler shape with fewer committed lines, and prunes comments that repeat the code. It reports findings and asks what to do next; it never edits code on its own.
---

# review-pr

Judge a change the way this repo judges one. You produce a **findings report**, never edits. The user decides afterwards what gets fixed, delegated, posted or dropped.

Two things make this different from a generic code review, and they are where the real findings live:

- **Written rules beat taste.** Every changed file is governed by the CLAUDE.md files above it: root, package, sometimes a subdirectory. You read those files during the review and check the diff against what they say. They are the rulebook, so a finding that quotes one is blocking, and a finding that cannot is an opinion.
- **Docs drift hardest.** The website content tree has its own written style rules, and it is the part that most often lands wordy, full of internals, or written in long chained clauses. Read the rules with the pages open, every time.

The bias throughout: **fewer committed lines**. A new type that could be derived, a new file that could be three lines in an existing one, a comment that repeats the line under it. Each of those is a finding.

## The arc

1. **Scope** the change: base ref, diff, governing CLAUDE.md files. One script does this.
2. **Frame** it: the spec doc and the PR description against what the diff actually does.
3. **Fan out** five review passes as parallel agents.
4. **Verify** every reported finding against the diff. Drop what does not hold, merge duplicates.
5. **Report**, then ask what to do.

## Step 1 - Scope

```bash
bash .claude/skills/review-pr/scope.sh [base-ref]
```

It prints the base ref and merge-base sha, the commits, the diff stat, the biggest added files, renames, the CLAUDE.md files governing each changed path, any spec doc in the diff, the website pages touched, and which source areas changed with no test change.

**Pin the merge-base sha it prints.** Every pass diffs `<merge-base>..HEAD` so all five see one identical change set. Comparing against a moving `origin/main` makes upstream commits look like the author's work.

Picking the target:

- Nothing named: current branch against `origin/main`.
- A branch named: check it out or diff it, base still `origin/main`.
- A PR number named: read it with `mcp__github__pull_request_read` for the description, the base branch and the open review threads, fetch the head branch, then diff locally against that PR's own base.

Then **read the whole diff yourself**: `git diff <merge-base>..HEAD`. On a large change read it area by area. You cannot verify an agent's finding about a change you have not seen.

## Step 2 - Frame: the spec and the description

Both of these are written before the code and often never updated. Treat them as claims to test, not as context to trust.

**Find the spec.** A `docs/todos/x.md -> docs/done/x.md` rename in the diff is this PR's spec. No rename means either the spec is still in `docs/todos/` or there is no spec. Read the whole file, including its metadata header, `Done when` and `Out of scope`.

Then compare it to the diff and name which case you have:

| Case | What you should see | What to report |
| --- | --- | --- |
| Matches | Spec describes what shipped | Nothing |
| Stalled | Spec plans approach A, diff does B | The spec has to describe what shipped before it moves |
| Part shipped | Spec promises more than the diff does | Split it: the moved doc records what landed, the rest becomes a new spec |
| Not moved | Spec still sits in `docs/todos/` | Check the repo's PR-readiness rules on this, then report against them |
| Superseded | An old spec was linked instead of rewritten | Check the same rules, they cover this case |
| Missing | Feature or fix with no spec | Not always wrong, but say so |

The root CLAUDE.md states the PR-readiness bar for specs. Read it during the review rather than working from this table alone: the table names the shapes, that file sets the requirement.

**Test the PR description the same way.** Does it describe the diff in front of you, or an earlier version of it? A stale description is cheap to fix and misleads every reviewer, so it is worth reporting.

**Check what the script flags.** It lists new lines outside `docs/` that name a `docs/todos/` or `docs/done/` file. The root CLAUDE.md has a rule about that; read it and judge the hits against it.

What comes out of this step is the **intent**: one short paragraph saying what this change is meant to do. Every pass agent gets it, because a reviewer who does not know the goal reports noise.

## Step 3 - Fan out the five passes

| Pass | The question it answers |
| --- | --- |
| guidelines | Does every changed file obey the CLAUDE.md files above it? |
| docs | Does the changed documentation say it plainly, in this repo's voice? |
| reuse | Can a new type or function be derived from, or replaced by, one that already exists? |
| architecture | Is there a simpler obvious shape, with fewer new files and fewer committed lines? |
| comments | Does each comment earn its line? |

Spawn all five in **one message** so they run at once, with `subagent_type: general-purpose`. The full brief for each one is in [passes.md](passes.md): read it and paste the brief verbatim into the agent prompt, filled in with the merge-base sha, the intent from step 2, the governing CLAUDE.md list, and the paths that pass should look at.

**No brief restates a repo rule, and neither should you when you write the prompts.** Each pass is told which files to read and asked to build its own checklist from them, then report that checklist with the findings. Rules change; a copy pasted into a prompt goes stale silently, and the checklist is also how you see what a pass actually covered.

Tell every agent plainly: read only, no edits, no commits.

Skip a pass only when the diff genuinely has nothing for it (no documentation changed, so no docs pass) and say in the report that you skipped it and why.

## Step 4 - Verify before you report

Agents over-report. They cite lines that moved, quote rules that do not exist, and call a rewrite "simpler" when it is only different. Nothing reaches the user unverified:

- **The citation is real.** Open the file at the cited line and check the code says what the finding claims.
- **The rule is real.** A rule finding must quote the CLAUDE.md line it breaks, and you check that line exists. If it does not, either drop the finding or label it as taste.
- **The simpler option is really simpler.** Count it: does the suggestion remove more lines than it adds, and does it keep the behaviour? If you cannot show that, drop it.
- **It is in scope.** The change under review is the diff. A problem in untouched code is not this PR's finding; route it per step 5.
- **Merge duplicates.** The reuse and architecture passes overlap by design, so the same finding often arrives twice. One entry, best evidence.

## Step 5 - Report, then ask

Keep the report short enough to act on. Order matters more than volume: a long list nobody reads is worse than the five findings that matter.

```markdown
## Review: <branch> vs <base>   (N files, +X / -Y lines)

**Verdict:** ready to open | fix these first (K blocking)

**Spec:** <spec file, and which case from step 2>
**Description:** matches the diff | stale, says "<quote>" but the diff does <what>

### Blocking
1. **<one line claim>** `path/file.ts:42`
   Rule: <quoted CLAUDE.md line, with the file it comes from>
   Fix: <the concrete, small change>

### Worth fixing
### Nits

### Passes skipped
<pass, and why nothing applied>
```

Severity:

- **Blocking**: breaks a written rule, breaks behaviour, a fix or feature with no test, spec or docs contradicting the code, docs missing for a user-visible change.
- **Worth fixing**: reuse, simplification, wordy or internals-heavy docs, a comment that no longer matches the code.
- **Nit**: naming and phrasing where both readings are fine.

Then ask what to do. The root CLAUDE.md sets the rule for where a finding goes: related ones are fixed in this change, unrelated ones go to a parallel background agent through the [delegate-finding skill](../delegate-finding/), and nothing is left as a note. Follow it rather than inventing a third lane. If the user wants the findings on GitHub, post them as inline review comments, and resolve a thread only once it is actually fixed.

## What NOT to do

- **Do not edit code.** This skill reviews. Fixes happen after the user picks them, as their own step.
- **Do not run tests, builds or lint, and never report a test result you did not produce.** This review reads. The host is often not bootstrapped, and "tests pass" from an unbuilt host is a false claim. Reporting that a behaviour has no test is fine and expected.
- **Do not copy rules out of a CLAUDE.md into a prompt or a report as if they were fixed.** Point the pass at the file, let it read the current text, and quote what it found.
- **Do not report a rule you cannot quote.** Cite the line or call it taste.
- **Do not review untouched code.** Being next to the diff is not being in it.
- **Do not pad the report.** Ten nits hide one blocking finding.
- **Do not rewrite the author's approach** when it works and breaks no rule. "I would have done it differently" is not a finding.
- **Do not trust the spec or the PR description** as a description of the change. They are the thing being checked.

## Gotchas

- **`origin/main..HEAD` is not the change.** Use the merge-base range from the script, or upstream commits show up as the author's work.
- **A spec that reads perfectly can still be stalled.** It was written before the code. Check it against the diff, not against itself.
- **The docs pass finds the most, and gets argued with the most.** Quote the guideline and show the rewritten sentence. A concrete shorter sentence wins an argument that adjectives do not.
- **The docs style rules are written down and they move.** Read `container/website/CLAUDE.md` during the review, including the pages it says to read first, and check the diff against what it says today. The same file also says which tools may touch that tree, which decides what a valid fix looks like.
- **New file, low bar to question it.** Ask what it would cost to put the code in the file that already owns that job. Often nothing.
