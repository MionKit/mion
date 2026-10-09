---
name: review-pr
description: Review a PR or branch in fresh subagents, fix findings or let user pick. Use to review a PR, branch, diff.
---

# review-pr

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Judge a change the way this repo judges one. Output: a findings report, never edits.

## Hard rules

- ⚠️ Review ALWAYS runs in `pr-reviewer` subagents, never in the session that asked for it.
  Author's memory of why a line exists is what talks a real finding out of a report.
- Even when caller did not write the code: a session reading this repo all day is not fresh either.
- Reviewer reads diff, builds checklist, verifies findings in a context knowing only what is on disk.
- One agent per checklist group: a group that cannot see another group's work cannot talk its finding away.
- Checklist never shown to user, never approved, in either mode. Only findings are.
- Docs + comments: out of scope, completely. `docs-simplifier` + `comments-simplifier` own them.
  They run once, after review + its fixes, so they see final text. This skill never runs them.
- Missing docs is never a finding, however tempting. Leave it.
  (Docs written beside code come out long; simplify pass cuts on purpose. Asking for pages undoes that.)

## Roles

Read your half: [Calling session](#calling-session) or [Reviewer](#reviewer).

## Calling session

Asked to review something. Five steps, none is reviewing. After step 1 it all runs on its own.
Never read the diff to "check" a finding, never build the checklist: that puts back the context the split removed.

1. **Ask the mode** once, with the question tool, before anything else:
   - **Automatic**: whole review runs, you decide what to fix and fix it, no more asks. User gets final summary.
   - **Reviewed by you**: whole review runs, you present every finding, user picks what to fix.
   - Skip the question if the request already says ("review it and fix what matters") or calling skill passed it.
2. **Spawn the checklist reviewer**: one independent `pr-reviewer`, target only. Template in [caller.md](caller.md).
3. **Fan the groups out**: one `pr-reviewer` per group, all in ONE message. Template in [caller.md](caller.md).
4. **Send group reports to the merger**: SendMessage to the checklist reviewer. Template in [caller.md](caller.md).
5. **Triage the report**: [caller.md](caller.md#5-triage). Read before presenting or fixing anything.

### Calling session must NOT

- Review. Not before spawning, not "just the diff stat". Reading a finding's cited lines in triage is fine.
- Build or edit the checklist. Show it to the user or ask approval, in either mode.
- Drop a finding silently. Reviewed mode: only user drops. Automatic: drop only after reading, list each + reason.
- Start a new checklist reviewer for the merge. SendMessage the first; group agents are the only other reviewers.
- Trim a group's block when fanning out. Hand one agent two groups.

## Reviewer

You are a `pr-reviewer`. Read, judge, report. Never edit, commit, or run tests / builds / lint.
Never report a test result you did not produce (host often unbootstrapped). "Behaviour has no test" is fine.
Your prompt names your role. The arc:

1. **Scope** the change. One script. *(checklist builder)*
2. **Frame**: read spec + PR description, write the intent. *(checklist builder)*
3. **Build** the review list, filtered to what this diff contains. *(checklist builder)*
4. **Hand it back** by group. *(checklist builder)*
5. **Check your group.** *(group checker)*
6. **Verify** every finding against the diff. *(group checker)*
7. **Merge and report** against the list. *(merger = checklist builder resumed)*

- Steps 1-4: [checklist.md](checklist.md). Read before scoping.
- Steps 5-6: [groups.md](groups.md). Read before checking a group.
- Step 7: [merge.md](merge.md). Read before merging group reports.

Why list first: a review with no written scope reads as opinion; nobody can tell what it skipped.
Written list = auditable, every finding gets a number.

Bias throughout: **fewer committed lines**. Derivable new type, new file that fits in 3 lines elsewhere,
abstraction with one caller: each is a finding.

Never rewrite the author's approach when it works and breaks no rule. "I'd have done it differently" ≠ finding.
