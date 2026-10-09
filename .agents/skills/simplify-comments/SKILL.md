---
name: simplify-comments
description: Cut comments to one-liners of what code cannot say, no fact lost. Use before a PR or to clean up comments.
---

# simplify-comments

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Leave only what the code cannot say. Correct first, short second:
a wrong comment, or one that lost its one fact, is worse than a long one.

Output: files edited in place, plus a report of every comment changed, deleted or kept, with the reason.

## The rules

Read first, every run: [code-style.md](../../docs/code-style.md) + [examples.md](examples.md)
(real before / after comments from this repo).

1. **One line, under ~120 chars.** Not a paragraph squeezed onto one line: past ~120, cut words,
   or split into two lines of one sentence each. A `/** */` or `/* */` one-liner counts.
   Only multi-line comment: file header, one paragraph max, only when name + exports do not give the file's reason.
2. **Only what code cannot say**: reason, constraint, invariant, ordering requirement, trap,
   or link to what forced the choice. What the code below shows (what it does, what it calls,
   what the branch checks, what the variable holds) goes.
3. **Correct over short.** Shortening would drop the fact → keep fact, cut words around it.
   Unsure what it means → read the code until sure. Still unsure → leave it, list in report.
4. **Always shorter, usually much shorter.** Five lines to one is normal.
   Came out longer = failed edit: revert, list under Kept with why.

## Scope

Given a list of paths, or "the branch". For the branch:

```bash
MB=$(git merge-base origin/main HEAD)
git diff --name-only $MB..HEAD -- '*.ts' '*.go' '*.mjs' '*.js' '*.vue'
git diff $MB..HEAD -- <each file>          # which comments and which functions changed
```

- Yours: every comment the branch added or changed + every comment inside a function or block it changed.
- Not yours: comments in code the branch did not touch, however bad.

Never touch:

- Semantic comments: [protected.md](protected.md). Read before step 0 below.
- License headers.
- Generated files (`*.generated.*`, `go-generated/`), `third_party/`, `_deps/`, `testdata/`, `node_modules/`.
- `packages/private-examples/`: those comments are docs, owned by the simplify-docs pass.
- Anything not a comment. Code, strings, test names, JSON tags stay byte for byte.

## Per comment, in order

0. **Semantic tag or another tool reader?** → straight to Kept. No shortening steps.
1. **Read the code it sits on** until you can say in one sentence what it does without the comment.
2. **Find the fact the code cannot say.** Cross out each clause the code shows. Rest = comment. Nothing left → delete.
3. **Write one line**: plain words, fact first, under ~120 chars.
4. **Check against the code again.** New line must be true of the code now, not as the old comment described it.
5. **Multi-line file header** → one paragraph: why the file exists + the one thing to know before editing.
   Delete the rest, or move a line about one function onto that function.

## Verify

```bash
pnpm run lint                                                   # typecheck plus both linters
go -C ts-go-runtypes vet ./internal/... ./cmd/...               # when a Go file changed
pnpm run format                                                 # gofmt and oxfmt, safe here
git diff -U0 | grep '^[-+]' | grep -v '^[-+][-+]' | grep -v '^[-+]\s*\(//\|/\*\|\*\|$\)'   # must print nothing
```

- Last line = the guard: anything but comment + blank lines changed → code changed → pass fails.
- Guard misses semantic-comment changes. After formatting, diff every protected comment vs merge-base:
  bytes, delimiters, scope, target code unchanged. Revert a formatter edit that breaks this before reporting success.
- Word counts: comment lines only, not `git show <merge-base>:<file> | grep -c ''`.
  Run `grep -E '^\s*(//|/\*|\*)' <file> | wc -w`, same over `git show <merge-base>:<file>`.
- After < before, every file. Report template → [report.md](report.md).

## Hard rules

- Run in a fresh context. Wrote the code? Hand this to the `comments-simplifier` agent (writer keeps every comment).
- Never change code: no name, no blank line inside a function, no import order. Never work around the guard.
- Never delete a fact (reason, constraint, invariant, trap). Never guess: not understood → Kept, never "simplified".
- Never add comments, even where one seems missing. Say so under Kept.
- Never commit. Caller reviews the report against the code and commits.

## Gotchas

- The "why" often hides at the end of a long comment. Read to the last sentence before calling it a restatement.
- A comment naming a file or function is often the only link. "Mirrors X in file Y" = fact code cannot say:
  keep the pointer, cut the prose.
- Go doc comment on an exported name: linter-checked shape `// Name does X.`. Keep the name first.
