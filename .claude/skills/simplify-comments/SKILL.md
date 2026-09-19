---
name: simplify-comments
description: Cut code comments on a branch down to one-liners that say only what the code cannot, without losing a fact. Use before a PR on any touched source file, or when asked to clean up comments.
---

# simplify-comments

Read every comment the branch added or changed, and every comment in a function it touched, and leave only what the code cannot say. The bar is correctness first: a comment that is wrong, or that lost the one fact it existed for, is worse than a long one. Simplify second.

The output is: the files edited in place, plus a report of every comment changed, deleted or kept as is, with the reason.

## The rules

1. **One line.** Every comment is a single line. A `/** */` or `/* */` one-liner counts. The only multi-line comment allowed is at the top of a file, one paragraph at most, and only when the file needs a reason to exist that its name and exports do not give.
2. **Only what the code cannot say.** A comment states a reason, a constraint, an invariant, an ordering requirement, a trap, or a link to the thing that forced the choice. Anything a reader gets from the code below it (what it does, which function it calls, what the branch checks, what the variable holds) goes.
3. **Correct over short.** When shortening would drop the fact, keep the fact and cut words around it. When you are not sure what the comment means, read the code until you are; if you still are not sure, leave it and list it in the report.
4. **Always shorter, usually much shorter.** Every comment you touch ends up with fewer words than it had, and most end up with far fewer: five lines to one is the normal outcome, not the exception. A comment that comes out longer is a failed edit; revert it and list it under Kept with why.

Read the *Code style* section of the root [CLAUDE.md](../../../CLAUDE.md) first, every run, and [examples.md](examples.md) in this skill: real comments from this repo, before and after.

## Scope

You are given either a list of paths or "the branch". For the branch:

```bash
MB=$(git merge-base origin/main HEAD)
git diff --name-only $MB..HEAD -- '*.ts' '*.go' '*.mjs' '*.js' '*.vue'
git diff $MB..HEAD -- <each file>          # which comments and which functions changed
```

Yours: every comment the branch added or changed, and every comment inside a function or block the branch changed. Not yours: comments in code the branch did not touch, however bad.

Never touch:

- Directive comments: `//go:build`, `//go:generate`, `// @ts-`, `// @mion-`, `// eslint-`, `// oxlint-`, `// biome-`, `// ^?`, `// ^|`, `// @annotate`, `// start-` / `// end-` markers, `GC-GUARD`, and any other comment a tool reads.
- License headers.
- Generated files (`*.generated.*`, `go-generated/`), `third_party/`, `_deps/`, `testdata/`, `node_modules/`.
- `packages/examples/`: those comments are documentation and belong to the simplify-docs pass.
- Anything that is not a comment. Code, strings, test names and JSON tags stay byte for byte.

## Per comment

In this order, for each comment you own:

1. **Read the code it sits on** until you can say, in one sentence, what the code does without the comment.
2. **Find the fact the code cannot say.** Cross out every clause the code already shows. What is left is the comment. If nothing is left, delete it.
3. **Write it as one line**, plain words, the fact first. A Go doc comment on an exported name still starts with the name.
4. **Check it against the code again.** The new line must be true of the code as it is now, not as the old comment described it.
5. **A multi-line file header** shrinks to one paragraph that says why the file exists and the one thing a reader must know before editing it. Delete the rest, or move a line that belongs to a specific function onto that function.

## Verify

```bash
pnpm run lint                                                   # typecheck plus both linters
go -C ts-go-runtypes vet ./internal/... ./cmd/...               # when a Go file changed
pnpm run format                                                 # gofmt and oxfmt, safe here
git diff -U0 | grep '^[-+]' | grep -v '^[-+][-+]' | grep -v '^[-+]\s*\(//\|/\*\|\*\|$\)'   # must print nothing
```

The last line is the guard: a pass that changed anything but comment lines and blank lines has changed code, and fails.

For the report's word counts: `git show <merge-base>:<file> | grep -c ''` is not it; count the words on comment lines only, before and after (`grep -E '^\s*(//|/\*|\*)' <file> | wc -w`, and the same over `git show <merge-base>:<file>`). After must be lower than before in every file.

## Report

```markdown
## <file>   (comment words <N> -> <M>)

Shortened: L<n> "<old>" -> "<new>" (dropped: <what the code already shows>)
Deleted:   L<n> "<old>" (the code shows it)
Header:    <k> lines -> <m> lines, kept: <the reason the file exists>
Kept:      L<n> "<old>" (not sure what it means; the code does <what you saw>)
```

Every "kept" line is for the caller to decide. Every other line is yours.

## What NOT to do

- **Do not change code.** Not a name, not a blank line inside a function, not an import order. The guard in Verify catches it; do not work around the guard.
- **Do not delete a fact.** A reason, a constraint, an invariant, a trap: it stays, in fewer words.
- **Do not guess.** A comment you do not understand is kept and reported, never "simplified".
- **Do not touch a directive, a generated file or an example file.**
- **Do not add comments.** Even where one seems missing. Say so under Kept.
- **Do not commit.** The caller reviews the report against the code and commits.

## Gotchas

- **Run in a fresh context.** The session that wrote the code knows why every comment is there and will keep all of them. If you are that session, hand this to the `comments-simplifier` agent.
- **"Why" often hides at the end of a long comment.** Read to the last sentence before deciding a comment restates the code.
- **A comment that names a file or a function is often the only link.** "Mirrors X in file Y" is a fact the code cannot say; keep the pointer, cut the prose around it.
- **Go doc comments have a shape linters check**: `// Name does X.` on an exported name. Keep the name first.
