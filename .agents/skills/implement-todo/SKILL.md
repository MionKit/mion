---
name: implement-todo
description: Build a docs/todos/ spec end to end: plan, review, simplify, PR, green CI. Use to implement or pick a todo.
---

# implement-todo

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Carry one `docs/todos/` spec through: plan, build, review, simplification, open PR, green CI.
Done = PR open AND green, not before.

## Modes (asked once, step 1)

Planning (steps 1-6) asks the user questions in BOTH modes. Mode only decides what follows approval:

- **Automatic**: steps 7-13 run alone, no more questions, until PR open + CI green.
  Where a step would ask: decide, pick safer option, list each decision in final message. Review runs automatic.
- **Manual**: user stays in the loop. Forks are asked. Review runs reviewed-by-you: user picks what to fix.

## Hard gate

- ⚠️ No file edits until the user approves a plan through the approval workflow.
- Steps 1-6 = reading, investigating, asking. Analysis only. Step 7 starts only after approval.
- Not in plan mode? Enter it once the todo is chosen (Claude: EnterPlanMode; Codex: plan mode if available).
  Then investigation cannot mutate files, questions read as planning, user sees the intent before the build.
- Never answer planning questions for the user. Only after approval, only in automatic mode, decide yourself.

## The arc

1. **Pick** the todo (question tool, unless user named one) + **ask the mode**.
2. **Read** it fully, **summarize** it back.
3. **Classify** from metadata `spec`: ready-to-build plan, or guidelines to plan from?
4. **Decide** tests / docs / fuzzing obligations.
5. **Refine** open questions with the user (only if investigation left forks).
6. **Present the plan** for approval. ALWAYS, even for a complete spec.
7. **Implement** to the plan + spec's Done when.
8. **Gate + finish**: tests green, docs updated, spec reconciled with what shipped, `git mv` into `docs/done/`.
9. **Review**: review-pr skill over the branch, findings fixed.
10. **Docs simplification**: `docs-simplifier` subagent, simplify-docs skill, every touched page + example.
11. **Comment simplification**: `comments-simplifier` subagent, simplify-comments skill, every touched source file.
    Steps 10 + 11 run at the same time. Both always, never by you.
12. **Open the PR**.
13. **Drive CI to green**.

- Steps 1-6: [plan.md](plan.md). Read before picking a todo.
- Steps 7-8: [build.md](build.md). Read before the first edit.
- Steps 9-13: [ship.md](ship.md). Read before the review.

## Never

- Edit any file before the plan is approved.
- Skip tests on a fix or a feature: the gate rejects it.
- Add fuzzing without asking, or hand-roll the fuzzer: route to the fuzzy-testing skill.
- Pull candidates from `docs/done/` or `docs/maybe/`: only `docs/todos/` holds ready work.
- Exceed the todo's stated Out of scope. Leave the spec in `docs/todos/` after finishing it.
- Move a diverged spec unchanged: update it to what shipped before `git mv` to `docs/done/`.
- Skip the review. Open the PR before review + both simplification passes are committed.
- Skip a simplification pass, run one in this session, or accept a result that changed a fact.
- Stop at an open PR: a red check or a conflict = todo not done.
- Let an unrelated issue end as a filed-and-forgotten spec. Delegate via [delegate-finding](../delegate-finding/).
  A spec only for what truly cannot land in either lane: a commitment to finish, not a way to close the loop.
