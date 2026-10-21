# Step 6 - Write the doc

On approval only.

- `<slug>`: short kebab-case from the title, reads like it (`stamp-the-resolver-binary.md`, not `todo-3.md`):
  the user recognizes it by filename in the `implement-todo` picker. Check no collision with an existing file.
- `created`: today's date, absolute (`2026-07-22`, not "today"): relative dates rot.

```markdown
---
type: <fix | feature | docs | chore>
spec: <full-plan | guidelines>
status: ready
created: <YYYY-MM-DD>
---

# <Concise title>
```

Body, sized to `spec`:

- **Guidelines**, lean:
  - `## Intent`: what and why.
  - `## Direction`: rough approach + verified pointers/constraints; say plainly the implementer plans the details.
  - `## Docs`: the page, "existing section <title>" or "new section" (or "none, because …"), + fixed last line below.
  - `## Done when`: rough acceptance bar, ending with the simplification pass.
- **Full plan**: shape every full-plan spec in `docs/todos/` follows (open one with `spec: full-plan` to see it):
  - `## Problem`, `## Plan` (or `## Fix direction`) with `file:line` pointers, `## Tests`, `## Docs`,
    `## Fuzzing` (if a feature), `## Out of scope`, `## Done when`.

Every `## Docs` section, both shapes, ends with this step, word for word (line break optional):

```markdown
Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.
```

- Every `## Done when` lists both passes: "the simplify-docs pass ran on every touched page and the
  simplify-comments pass on every touched source file, each committed on its own".
- No docs impact → "Docs: none, because …", skip the docs line. Touches any page or example → never skip.
- Comments pass: no opt-out short of a branch that touched no source file.
