# Real examples: before and after

Every "before" is a comment that was in this repo. Judge the comment in front of you against these.

## The fact survives, the prose goes

Before, five lines, of which one clause is the fact:

```go
// Every claimer counts as used, not just the one whose action won. That
// is what keeps a file comment from turning the line comments it covers
// into forty "this silenced nothing" reports: each still claims its own
// finding. A line comment on a line that raises nothing was already
// stale before the file comment arrived, and is still reported.
```

After:

```go
// Mark every claimer used, or a file comment would report every line comment it covers as stale.
```

Before, four lines; the code below shows the loop, only the comments-only case is not obvious:

```go
// firstCodeOffset is where the file's code begins: the first byte that is
// neither whitespace nor inside a comment. Comments come in source order, so one
// pass over them is enough. A file of nothing but comments answers its length,
// which makes every directive in it a file directive.
```

After:

```go
// firstCodeOffset is the first byte outside whitespace and comments; a comments-only file answers its length.
```

Before, four lines above `export const DOWNGRADE_ALL = '*';`; the name and the value say what it is:

```ts
// DOWNGRADE_ALL is the wildcard shape: every RuntimeError code reports as a
// Warning, and it never reaches a fatal Error. The blunt instrument, kept for
// adoption, where a project turning mion on cannot yet list the codes it has
// not met.
```

After:

```ts
// Kept for adoption: a project turning mion on cannot yet list the codes it has not met.
```

## One line is not a paragraph on one line

Before, from the first run of this pass, 170 characters:

```go
// DirectiveScope says how far a directive reaches; the caller picks it from the comment's shape (a block comment before any code covers the file, as ESLint's `/* eslint-disable */` does).
```

After:

```go
// DirectiveScope is picked from the comment's shape: a block comment before any code covers the file.
```

## Half restates the code

Before, above `if removed { continue }`:

```go
// Removing wins over lowering: a finding cannot be both gone and printed.
```

After (the first half is the `if`):

```go
// A finding cannot be both gone and printed.
```

## The whole comment restates the code

Before, above `const byteToChar = makeByteToChar(source);`:

```ts
// Build the byte-to-char table for this source before applying the edits.
```

After: deleted.

## A file header, three paragraphs to one

Before, at the top of `apply-edits.ts`, three paragraphs on how the module works, how it was validated, and what the offsets are.

After, one paragraph:

```ts
// Applies the resolver's edit list in JS, so the rewritten file and its source map never
// cross the wire. Must call prepend / appendLeft / update in the same order as Go's Apply,
// or the two modes stop being byte-identical. Offsets are UTF-16 code units, already
// converted on the Go side.
```

The validation history moved nowhere: the mode-parity test is where that fact lives.

## What the "before" side keeps doing

- Explaining the mechanism the code shows, then the reason, in that order. Only the reason stays.
- Telling a story ("when it replaced that dependency", "forty reports"). The fact stays, the story goes.
- Restating the condition of the `if` above the `if`.
- Naming what a variable holds, above the line that assigns it.
- A header that documents the module's history instead of its one invariant.
