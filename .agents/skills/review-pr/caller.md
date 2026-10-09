# Calling session: templates and triage

Detail for the calling session steps in [SKILL.md](SKILL.md#calling-session).

## 2. Spawn the checklist reviewer

Spawn via the tool mapping, target and nothing else:

```
Review <the current branch against origin/main | branch <name> | PR #<n>>.
Follow the review-pr skill, the reviewer's half, from step 1.
No approval is coming: return the final checklist, one block per group.
```

- Add what the user said worries them, in their words.
- Never add your own summary of the change: reviewer reads it from disk.
  Your summary is the context the split exists to keep out.
- Named role unavailable → tool mapping's fresh-context fallback, told to read this skill first.

## 3. Fan the groups out

- Checklist builder's first turn ends with: pinned merge-base, intent, one block per group.
- User request fitting no group = group `U`.
- One `pr-reviewer` per group, all in ONE message (run at once).
- Copy each block verbatim (copying is not editing). Nothing else: no change summary, no other group's items.

```
Check group <X> of the checklist for <the target>.
Follow the review-pr skill, the reviewer's half, role "Group checker".
Merge base: <sha>
Intent: <the intent paragraph, verbatim>
Items:
<the group's block, verbatim>
```

Each returns its answers + verified findings. Relay nothing yet.

## 4. Send group reports to the merger

SendMessage every group report, whole + unedited, to the checklist reviewer (new Agent call loses context):

```
Group reports follow. Merge them into the report, step 7.
<every report, one after another>
```

It merges because it built the list and knows the change; group agents do not.

## 5. Triage

- Report holds everything that survived verification.
- Never summarise or cut it first: a finding hidden by shortening is lost like a deleted one.

**Reviewed by you**:

- Present EVERY finding, reviewer's order, then ask what to fix.
- Filter fixes, never findings. Never recommend dropping any; recommending is fine, dropping is the user's call.
- Fixing is a separate step, after the user picks. Never before.

**Automatic**: trim, decide, fix, no asking. Read the code at each cited line first, then sort each:

- **Fix now**: right + related. Fix here, this PR, own commit, own test.
- **Delegate**: right but unrelated → [delegate-finding skill](../delegate-finding/). Never a backlog note.
- **Drop**: wrong, already fixed, or pure taste. One line why, each.

Read every nit for what it says, not its label:

- Nits have held real problems: wrong name hiding a bug, missing case, small rule break.
- The label is the reviewer's guess.
- Drop a nit only after reading it and saying why it is wrong or why both readings are fine.
- Unsure → fix it.

Done → short summary: fixed, delegated, each drop + reason. Nothing dropped silently.

Findings wanted on GitHub → inline review comments. Resolve a thread only once actually fixed.
