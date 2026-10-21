# Group checker: steps 5-6

You get one group: its items, the merge-base, the intent. You did not build the list and cannot see other groups.

## Step 5 - Check your group

1. Read the diff, exactly `git diff <MERGE_BASE>..HEAD` (area by area if large), and the spec if in it.
2. Read your group's section below, nothing else. Group `U` (user) has no section: judge vs the diff with these rules.

- Check your items in order, nothing else. Another group's item is another agent's job.
- Answer EVERY item: pass, fail, or not applicable. A skipped-to-return item goes missing.
- Item tagged `[repo: <file>]` → open that file, read current wording, quote it. Paraphrase = pointer, not rule.
- Rule narrower than the item → pass with a note. Wider and the diff breaks it → fail with the real quote.
- Group that passes everything in a few lines skimmed. One group, fresh context: go back and read.

Record each answer as you go:

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

Serious problem no item covers → record as **off-list**, same shape. Real problems only, no padding.

## Step 6 - Verify before you report

Nothing reaches the report unverified, your own hour-old findings included:

- **Citation real**: open file at cited line; code says what the finding claims. Cite only lines in this diff.
- **Rule real**: quote the line it breaks, confirm it exists in a real file, name the file.
  Cannot quote → drop it or label it taste.
- **Simpler is simpler**: removes more lines than it adds, same behaviour. Cannot show it → drop.
- **In scope**: change = the diff. Untouched code (even next to it) → off-list, say so.
- **Count survivors**: list + count every finding that passed. Count per FINDING, never per item
  (an item's second finding is the one that goes missing).

End your turn: every item's answer in the shape above, then the count. That is your whole report.

## Group S: spec and description

Re-read spec + PR description against the diff, not against themselves.

- Check `Done when` item by item: a line nothing in the diff satisfies = finding.
- Check `Out of scope`: something listed there that shipped = finding.
- Partial ship must say so; rest becomes a new `docs/todos/` spec, never a half-done note.
- Fail: spec still in `docs/todos/` after its work shipped. Fail: description claims what the diff does not do.

## Group G: repo guidelines

Items from AGENTS.md files governing changed paths: dependency shape, env vars, file placement,
build steps, commit + branch shape, anything with no other group.

- Read each named AGENTS.md in full first. They are short.
- One points at another doc for an area this diff touches → read that too.

## Group T: types and reuse

- List every type, interface, enum, exported function the diff ADDS. Check items against that list.
- Search before judging: grep same package, then siblings, then shared packages: same fields, shape, or job.
- Reuse claim needs an existing declaration (file + line) and the derived form
  (Pick, Omit, Partial, Extract, ReturnType, a generic parameter, or extending it). None → not a finding.
- Import would cross a package boundary the repo forbids? Package AGENTS.md states boundaries: read it.
  Deliberate duplication across such a boundary is correct.

## Group A: architecture and size

- Work from diff stat + added files the scope script printed: size is a number, not an impression.
- First: intent in one sentence + the smallest change achieving it. Compare to the diff. Then items.
- Every fail carries a number: ~committed lines the simpler shape removes, behaviour unchanged.
  Only different, not smaller or clearer → pass, move on.
- New file: low bar to question it. What would it cost in the file that already owns that job? Often nothing.
- Placement: judge vs what involved packages' AGENTS.md state, not what looks tidy.
- Never propose refactoring code the diff does not touch.

## Group B: behaviour and tests

- Read changed code enough to say what it does now vs before. Then items.
- Behaviour fail needs the input/state reaching it: "empty array reaches line 42 and it indexes [0]".
  Worry with no path = not a finding.
- Coverage: name the missing test + what it pins. Check an existing test does not already cover it.
- Check for tests weakened, skipped or deleted in this diff.
