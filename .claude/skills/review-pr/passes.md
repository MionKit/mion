# The five review passes

One brief per pass. Paste the brief verbatim into the agent prompt and fill the
placeholders. Spawn all five in one message so they run at once.

**No pass restates a repo rule.** The rules live in the CLAUDE.md files and they
change; a copy here would go stale and would be wrong in the worst way, quietly.
Each pass reads the files that govern its area and builds its own checklist from
them, then reports that checklist so the coverage is visible.

## Shared header (prepend to every brief)

```
You are reviewing a change in the mion monorepo. Read only: do not edit, write,
format, commit or run tests. Your output is a findings list.

Diff range (use exactly this, nothing else):  git diff <MERGE_BASE>..HEAD
Intent of the change: <INTENT from step 2>
Changed files: <PATHS relevant to this pass>

Report every finding in this shape, most important first:

- claim:    one line, what is wrong
  where:    path/to/file.ts:LINE
  evidence: the exact line(s) from the diff
  reason:   the quoted rule it breaks, or why it costs the reader
  fix:      the concrete smaller change, with the replacement text where short
  severity: blocking | worth-fixing | nit
  confidence: high | medium | low

Rules: cite only lines that exist in this diff. Quote a rule only if you read it
in a real file, naming that file. If you find nothing, say "no findings" and
stop. A short list of real findings beats a long list of maybes.
```

## Pass 1: guidelines

```
Build a rule checklist from the CLAUDE.md files themselves, then check the diff
against it. Nothing is listed for you here on purpose: those files change, and
anything copied into this brief would be out of date.

Governing files, most specific wins on conflict:
<LIST from scope.sh>

Method:
1. Read each governing CLAUDE.md in full. They are short. Where one points at
   another document for the detail of an area this diff touches, follow the
   pointer and read that too.
2. Write a numbered checklist of every rule that could apply to these changed
   files. One line per rule, each naming the file it came from. Drop rules about
   areas the diff does not touch, and say which areas you dropped.
3. Walk the checklist against the diff item by item. Mark each one pass, fail or
   not applicable, with the file and line you checked.
4. Report the checklist first so the reviewer sees the coverage, then a finding
   for every fail.

Treat every rule as binding, whether or not it is marked important, and whatever
it covers: dependency shape, naming, file placement, tests owed, docs owed,
environment registration, build steps, commit and branch shape.

Report a finding only where you can quote both the rule line and the diff line
that breaks it. A rule you cannot quote is your opinion, so leave it out.
```

## Pass 2: docs

```
Review the changed documentation against the repo's own writing guidelines. Work
from the guidelines as written, never from memory or general style sense. This is
the pass that finds the most, because documentation lands wordy and full of
internals more often than anything else.

Read first, in full:
- container/website/CLAUDE.md, including the pages it tells you to read before
  writing or restyling
- the website documentation section of the root CLAUDE.md

Changed pages: <PATHS>

Method:
1. Turn those guidelines into a numbered checklist, one line per rule.
2. Check every changed page, and every changed paragraph, against each item.
3. Report the checklist with pass or fail first, then the findings.

Run the mechanical items rather than eyeballing them: grep the changed pages for
whatever the guidelines ban as punctuation, and measure anything they set a
length bar for.

Two judgements are yours beyond the checklist:
- Wordy or internals-heavy prose. For every sentence you flag, write the shorter
  replacement in the fix field. The rewrite is the finding; "too complex" is not.
- Missing documentation. Does the diff change user-visible behaviour that no page
  mentions yet? That is blocking.
```

## Pass 3: reuse

```
Find new types and new functionality that could come from something that already
exists. Every redundant declaration is committed lines someone has to maintain.

Changed files: <PATHS>

Method:
1. List every type, interface, enum and exported function ADDED by the diff.
2. For each one, search for a near match before judging it: grep the same
   package, then its siblings, then the shared packages, for the same field set,
   the same shape, or the same job under another name.
3. Ask, in this order:
   - Does this type already exist? Then import it.
   - Can it be derived? Pick, Omit, Partial, Extract, ReturnType, a generic
     parameter on the existing type, or extending it. Prefer deriving, because a
     derived type follows its source when the source changes.
   - Is it a near copy of a neighbour that differs by one field? Then the two
     should share a base.
   - Same questions for functions: does a helper already do this, and does the
     new one only wrap it under another name?
4. Flag the reverse too: a type widened or duplicated so two callers could share
   it, where a small generic would have kept both honest.

For each finding name the existing type or function by file and line, and show
the derived form you propose. A reuse claim with no existing declaration to point
at is not a finding.

Before flagging, check whether importing would cross a package boundary the repo
does not allow. The package CLAUDE.md states its boundaries; read it rather than
assuming. Deliberate duplication across such a boundary is correct.
```

## Pass 4: architecture

```
Judge the shape of the change. The goal is the simplest obvious version, and
fewer committed lines.

Diff stat: <STAT>
New files: <ADDED FILES with line counts>

Method:
1. Restate the intent in one sentence, then ask what the smallest change that
   achieves it looks like. Compare that to the diff.
2. Every new file: does it earn its existence? What would it cost to put this in
   the file that already owns the job? Name that file. A new file is right when
   it holds a genuinely separate concern, or the host file is already large.
3. Look for structure added ahead of need: an abstraction with one caller, an
   options object with one option, an interface implemented once, a registry with
   two entries, an indirection layer that only forwards.
4. Look for the missed extension point: did the author add a parallel path where
   the codebase already had a hook, a strategy table, or a branch to extend?
5. Look for copy-paste between the new files, and between a new file and the one
   it was modelled on.
6. Is anything placed wrongly? Package boundaries here are strict, so read the
   CLAUDE.md of the packages involved and judge placement against what they
   state, not against what looks tidy.

Every architecture finding carries a line count: roughly how many committed lines
the simpler shape removes, and confirmation that behaviour is unchanged. If the
simpler shape is only different, not smaller and not clearer, drop it.

Do not propose refactoring code the diff does not touch.
```

## Pass 5: comments

```
Review only the comments added or changed by the diff, in code files.

Changed files: <PATHS>

First read the code style rules in the root CLAUDE.md, plus any CLAUDE.md in the
directories these files live in, and take the comment and doc-block rules from
there. Then apply the general bar: a comment stays only if it says something that
cannot be read from the code, and it says it in as few lines as possible.

Delete or rewrite:
- Restates the line below it ("// increment the counter").
- Names the function again in prose above it.
- A doc block using tags the repo's style rules ban, where the types already
  carry the information.
- A multi-line block that says one thing: collapse it to one line.
- Commented-out code, a TODO with no owner and no plan, a leftover debug note.
- Stale: describes behaviour the diff just changed. Quote both and mark it
  blocking, because a wrong comment is worse than no comment.

Keep:
- Why, not what: the reason a surprising choice was made, the constraint that
  forced it, the bug it avoids.
- A load-bearing invariant, an ordering requirement, a pointer to the spec of a
  format.
- A warning that the obvious simplification here is wrong.

For each finding give the replacement one-liner, or say "delete" outright. Be
strict, but do not strip a comment carrying real reasoning just because it runs
to two lines. If you cannot tell whether it is load-bearing, mark confidence low
and say what would settle it.
```
