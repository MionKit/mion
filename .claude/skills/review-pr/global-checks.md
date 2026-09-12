# Global review checks

The criteria that are not written in any CLAUDE.md: ordinary good-engineering
review. This file is the **second** source and the smaller one. The guidelines
themselves live in the CLAUDE.md files above each changed directory, they are
read in full at review time, and they win wherever the two overlap.

It is a **catalog to filter**, never a list to run whole, and never a substitute
for reading those files.

Each item has an id, so the review list, the pass briefs and the final report can
all point at the same thing. Include an item only when its trigger is in the
diff, and say in the review list which groups you dropped and why.

## S - spec and description (include always)

- S1 The spec describes what shipped, not an earlier plan.
- S2 Everything the spec promised shipped, or the split is explicit.
- S3 The PR description matches the diff in front of you.
- S4 The change has a spec at all, or a stated reason it does not need one.

## D - documentation (include when docs, public behaviour or public API changed)

- D1 A user-visible change is documented on the page a reader would look at.
- D2 The docs describe what the code now does, not what it used to do.
- D3 Examples in the docs would actually run and typecheck.
- D4 Plain language: a reader learns what it does for them, not how it is built.
- D5 Says it once. No sentence repeats the one above it in other words.
- D6 Short sentences over long chained clauses.
- D7 No internals a user cannot act on.
- D8 The page still reads in order after the edit, no orphan paragraph or dead link.

## T - types and reuse (include when types or exported functions were added)

- T1 The new type does not already exist somewhere under another name.
- T2 A type that restates part of another is derived from it instead (Pick, Omit,
    Partial, Extract, ReturnType, a generic parameter, extending it).
- T3 Two near-identical new types share a base instead of drifting apart.
- T4 A new function is not a rename of an existing helper.
- T5 The type is as narrow as the values it really holds, no wider.
- T6 A type is exported only if something outside needs it.
- T7 Generic parameters earn their place, one caller shape means no generic.

## A - architecture and size (include when files were added, moved or restructured)

- A1 A new file holds a separate concern, or the file that owns the job was full.
- A2 There is no simpler obvious shape that does the same thing in fewer lines.
- A3 No abstraction with one caller, no options object with one option, no
    interface implemented once, no layer that only forwards.
- A4 The change extends the existing hook or table rather than adding a parallel path.
- A5 No copy-paste between the new files, or from the file they were modelled on.
- A6 Placement respects the package boundaries the packages themselves state.
- A7 Nothing left dead: the code this change replaces is gone, not orphaned.
- A8 The committed line count is close to the smallest that does the job.

## C - comments (include when comments were added or changed)

No items here. The comment rules live in the code style section of the root
CLAUDE.md, so this group is sourced entirely from that file. Keep the group and
its pass, read the items out of the file.

## B - behaviour and tests (include when code changed)

- B1 New branches handle their boundary cases (empty, zero, one, maximum, missing).
- B2 Errors are handled or propagated, never swallowed.
- B3 Async work is awaited, nothing is left floating.
- B4 Input crossing a boundary is validated before it is used.
- B5 A public signature change is either backwards compatible or called out.
- B6 Every changed behaviour has a test that would fail without the change.
- B7 No test was weakened, skipped or deleted to make the change pass.
- B8 Nothing added to a hot path that runs per request without a reason.
