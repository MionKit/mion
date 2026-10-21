---
name: create-todo
description: Write a request as a docs/todos/ spec + metadata header, never implement it. Use to note/file/add a todo.
---

# create-todo

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Capture a request as a self-contained spec under `docs/todos/` (where `implement-todo` picks work).
Output: ONE markdown doc, never a code change. Opens with the metadata header; body = full plan or guidelines.
Which body is the user's call; guidelines is the usual answer.

## Gate

- ⚠️ Nothing written to disk until the user approves the drafted todo. Steps 1-5 = analysis.
- Not in plan mode? Enter it once the request is captured (Claude: EnterPlanMode; Codex: plan mode if available):
  investigation stays read-only, approval is explicit.

## Metadata header (contract with implement-todo)

`implement-todo` reads `type` + `spec` to decide how to treat the todo. `status` + `created` are conventional.

```yaml
---
type: feature       # fix | feature | docs | chore: the kind of work
spec: guidelines    # full-plan | guidelines: how complete this doc is
status: ready       # ready | blocked | ...: conventional
created: 2026-07-22 # absolute date (today): conventional
---
```

- `type`: `fix` (corrects wrong behavior), `feature` (new capability), `docs` (documentation only),
  `chore` (refactor / tooling / infra, no user-facing behavior change).
- `spec`: `full-plan` = complete plan, build directly. `guidelines` = direction + intent; implementer plans first.
- Never omit or guess `type` / `spec`: a wrong `spec` sends the implementer down the wrong path.

## The arc

1. **Capture** the idea + the *why*. Not a restatement: if terse ("dedup the union guard"), draw out why + constraints.
   Short: you record a request, not solve it.
   Check `docs/todos/`, `docs/done/`, `docs/maybe/` for the same topic. Match → surface it, never file a duplicate
   (user may reopen or extend it).
2. **Classify** `type` yourself (usually obvious). Ask (question tool) only if truly ambiguous
   ("improve X" = fix or feature?). State the classification in your summary.
3. **Ask** full plan or guidelines? Always the user's choice; never answer it for them. Lead with guidelines:
   - **Guidelines** (usual, not a lesser one): record intent + direction.
     `implement-todo` investigates + plans later, with fresh context.
   - **Full plan**: deep planning now, spec ready to build. Only when user wants the thinking up front.
   - Asked the `type` question in step 2 → fold both into one question-tool call.
4. **Investigate** to the matching depth. Detail → [investigate.md](investigate.md).
5. **Present** the exact todo (frontmatter + body) with the approval workflow in [the tool mapping](../TOOLS.md).
   User may amend type, spec choice, direction, wording. Fold edits in, re-present. No file before approval.
6. **Write** `docs/todos/<slug>.md`, header + body. Detail + templates → [write.md](write.md).
   Close: tell the user where it is filed; they can pick it up any time with `implement-todo`.

## Never

- Implement anything. This skill writes exactly one file. Work wanted now → `implement-todo`.
- Link to a specific todo from anywhere else (root AGENTS.md rule). In the todo you write too:
  describe the shape, never cite a sibling spec.

## Gotchas

- `implement-todo` found-a-bug follow-ups land here: usually a `fix`-type, `guidelines`-spec doc.
