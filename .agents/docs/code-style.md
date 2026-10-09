# Code style

Naming, types and comments in Go + TS source. Read before editing source code or its comments.

## Names and types

- No `I` prefix on interfaces. No `T` prefix on type parameters.
- Shared types + interfaces live in the package's `types.ts`. Only a type private to one file stays in that file.
- `InjectRunTypeId` (capital T mid-word): same casing as `RunType`.
- Prefer type casting over assertions.
- Meaningful names in Go + TS. No one-letter abbreviations like `p`, `c`, `t`.
  Loop indices (`i`, `k`, `v`) and `err` are fine.
- Struct field with a JSON tag → reuse that name for the local variable.

## Comments

- No `@param` / `@returns` in JSDoc. Prefer one-liner comments and one-line `if`s.
- A comment earns its line or it goes. Keep it only if it says what the code cannot:
  reason behind a surprising choice, constraint that forced it, ordering requirement or invariant.
- Delete anything restating the code below it.
- Never leave commented-out code, an ownerless TODO, or a comment the change just made stale.
- Every comment is one line. Only multi-line comment: a file header, one paragraph max,
  only when the file needs a reason to exist that its name and exports do not give.
- Every touched source file gets a comment simplification pass before the PR: the `comments-simplifier` subagent
  runs [simplify-comments](../skills/simplify-comments/SKILL.md), never the session that wrote the code.
  `implement-todo` runs it as its last step, beside the docs pass.
