# The groups

How to work each group of the approved checklist. You run them yourself, in this
file's order, one at a time, finishing a group before you open the next.

**A group never restates a repo rule.** The items carry what to check, and a
repo item names the file it came from so you read the current text. Rules
change; anything copied in here would go stale silently.

## Before every group

Diff range (use exactly this, nothing else):  git diff <MERGE_BASE>..HEAD

Take only this group's items. Check them in order. Answer every one before you
open the next group: pass, fail, or not applicable, in the shape step 5 of the
skill gives.

For any item tagged `[repo: <file>]`, open that file and read the rule in its
current wording before judging, then quote what you read. Your paraphrase on the
checklist is a pointer, not the rule.

Cite only lines that exist in this diff. Quote a rule only if you read it in a
real file, naming that file.

## Group S: spec and description

Read the spec and the PR description again, now against the diff rather than
against themselves. Both were written before the code.

Check what shipped against the spec's own `Done when`, item by item, and against
its `Out of scope`: something listed out of scope that shipped anyway is a
finding, and so is a `Done when` line nothing in the diff satisfies. A spec that
shipped only part of what it promised must say so and leave the rest as a new
`docs/todos/` spec, never as a half-done note.

A spec still sitting in `docs/todos/` after its work shipped is a fail. So is a
description that claims something the diff does not do.

## Group G: repo guidelines

These items come from the CLAUDE.md files that govern the changed paths:
dependency shape, environment variables, file placement, build steps, commit and
branch shape, and anything else with no other group.

Read each named CLAUDE.md in full before checking its items. They are short.
Where one points at another document for an area this diff touches, follow the
pointer and read that too.

Judge against the wording you read, not against what the item paraphrases. If
the rule turns out narrower than the item suggests, say so and mark the item
pass with a note. If it is wider and the diff breaks the wider version, that is
a fail with the real quote.

## Group D: documentation

This is the group that finds the most, because documentation lands wordy and
full of internals more often than anything else.

Read first, in full: container/website/CLAUDE.md, including the pages it tells
you to read before writing or restyling. Then check your items against every
changed page and every changed paragraph.

Run the mechanical items rather than eyeballing them: grep the changed pages for
whatever the guidelines ban as punctuation, and measure anything they set a
length bar for.

For every sentence you flag as wordy or internals-heavy, write the shorter
replacement in the fix field. The rewrite is the finding; "too complex" is not.

Missing documentation is a fail, not a gap: if the diff changes user-visible
behaviour that no page mentions, name the page it belongs on.

## Group T: types and reuse

Work from the additions: list every type, interface, enum and exported function
the diff ADDS, then check your items against that list.

Search before you judge. For each addition, grep the same package, then its
siblings, then the shared packages, for the same field set, the same shape, or
the same job under another name. A reuse claim with no existing declaration to
point at is not a finding, so name the existing one by file and line and show
the derived form you propose (Pick, Omit, Partial, Extract, ReturnType, a
generic parameter, or extending it).

Before flagging, check whether the import would cross a package boundary the
repo does not allow. The package CLAUDE.md states its boundaries; read it rather
than assuming. Deliberate duplication across such a boundary is correct.

## Group A: architecture and size

Work from the diff stat and the added files the scope script printed, so size is
a number rather than an impression.

Start by restating the intent in one sentence and describing the smallest change
that would achieve it. Compare that to the diff, then check your items.

Every architecture fail carries a number: roughly how many committed lines the
simpler shape removes, and confirmation that behaviour is unchanged. If the
simpler shape is only different, not smaller and not clearer, mark the item pass
and move on.

For placement, read the CLAUDE.md of the packages involved and judge against
what they state, not against what looks tidy.

Do not propose refactoring code the diff does not touch.

## Group C: comments

Look only at comments the diff adds or changes, in code files.

Read the code style rules in the root CLAUDE.md, plus any CLAUDE.md in the
directories these files live in, and take the comment and doc-block rules from
there before judging.

For each fail give the replacement one-liner, or say "delete" outright. Be
strict, but do not strip a comment carrying a real reason, constraint or
invariant just because it runs to two lines. A comment describing behaviour the
diff just changed is blocking: a wrong comment is worse than no comment.

If you cannot tell whether a comment is load-bearing, mark confidence low and
say what would settle it.

## Group B: behaviour and tests

Read the changed code closely enough to say what it does now versus before, then
check your items.

For a behaviour item, a fail needs the input or state that reaches it: "empty
array reaches line 42 and it indexes [0]". A worry with no path to it is not a
finding.

For a coverage item, name the test that should exist and what it would pin.
Check whether an existing test already covers it before calling it missing, and
check whether any test was weakened, skipped or deleted in this diff.

Do not run anything. You are reading tests, not executing them, and reporting a
result you did not produce would be a false claim.
