---
type: feature
spec: guidelines
status: ready
created: 2026-09-18
---

# A file that stands the same code down on every line has no way to say it once

## Intent

Both source directives are LINE-only. `AppliesToLine` is the whole targeting story
(`ts-go-runtypes/internal/diagnostics/expecterror.go`), so a file that raises the same
finding on forty call sites carries forty identical comments.

That shape is real and already in the tree. After removing `downgradeErrors: '*'` from the
run-types test configs, the suites carry 185 directives across 16 files, and some files say
one thing over and over: `test/suites/cloning/Unions.ts` has thirteen directives naming a
single code (`CES001`), because the whole file is the "clone refuses a union with object
members" suite. `test/suites/serialization/Atomic.ts` has thirty-nine naming eighteen codes,
which is not eighteen unrelated things: it is the same three root kinds (never, stdlib class,
symbol) across all six serializer families, one statement about the file written thirty-nine
times.

Give a file one comment that says it.

## Two forms, because the two tools it copies both earn their place

| Form | Copies | For |
| --- | --- | --- |
| Blanket: ignore everything in this file | TypeScript `@ts-nocheck` | A file that is wall to wall deliberate, where listing codes is busywork |
| Per code: name what this file stands down | ESLint `/* eslint-disable rule */`, Biome `// biome-ignore-all` | A file with a known finding that should still report anything new |

Ship both. The blanket is the convenient one and the per-code one is the honest one, and the
author picks; a project that wants the strict reading simply never writes the blanket.

## Direction

The implementer plans the details. These are the constraints.

- **Name the blanket after TypeScript so its behaviour is guessable**: `@mion-nocheck` reads
  as what it is to anyone who has met `@ts-nocheck`. It takes no code list.
- **Name the per-code forms after the line directives they mirror**, so the file twin of a
  known comment is obvious rather than a second vocabulary: a `-file` (or Biome's `-all`)
  suffix on both, taking the same optional-code-list grammar the line forms already parse.
  Both line directives get a file twin, including the downgrade: a suite that wants one code
  visible but not halting across a whole file is precisely `cloning/Unions.ts`.
- **A per-code file form with no codes is the blanket**, so it must be refused rather than
  silently becoming one. Two spellings for one behaviour is how a reader stops trusting
  either; the blanket has its own word.
- **Top of the file, before any code**, which is where TypeScript requires `@ts-nocheck` and
  where a reader looks. Anywhere else is not a file directive, the same way a trailing
  comment is not a line directive today.
- **`LevelError` is still never silenceable.** The level table says so and `Suppressible()`
  enforces it: those codes mean the build produced NO code for the thing, so hiding one buys
  a call that throws anyway. No file form may become the one way around that invariant.
- **Settle what a file form does to line directives in the same file.** A line directive
  covered by a file form becomes unused, and reporting forty `EXP001`s at a file the author
  just silenced is noise. Most likely the file form suppresses the judging for the codes it
  covers, but say so explicitly and test it.
- **Report a file directive that stood nothing down.** A directive that cannot outlive its
  problem is the reason mion's comments are safer than a config list. TypeScript does not do
  this for `@ts-nocheck` and it is the one place worth departing, because "this file is clean
  now, delete the comment" is cheap to answer and is the only honest meaning of unused.

## It has to work on the lint pass too

The directives run at the resolver's dispatch choke point, so a file form settles the finding
for the bundler build, `mion compile` and the editor at once. `PassScope` is what keeps the
self-checks honest per pass: `Files` already records which files a pass examined, which is
what makes "unused in this file" answerable without a false report from a pass that never
looked at it. Route the new codes in `packages/devtools/src/lint/diagnosticRouting.ts` the way
`EXP` and `DWN` are routed, and add the `oxlint-recommended.json` row if a new rule name comes
with them.

## Known cost of the blanket, accepted

`@mion-nocheck` hides findings nobody has met yet, including a real one introduced later,
which is what `downgradeErrors: '*'` did before the run-types configs stopped using it. That
is understood and intended: it is opt-in per file and visible at the top of it, rather than a
project-wide setting nobody reads. The docs should be direct about the trade, and should point
at the per-code forms as the tool that keeps the rest of the file honest.

## Tests

Go, mirroring `downgradeerror_test.go` and `expecterror_test.go`: a blanketed file reports
nothing; a per-code file form stands down what it names and lets everything else through; a
second file in the same program still reports normally; a `LevelError` code still reports
through both; a per-code form with no codes is refused; a file directive is only a directive
at the top of the file; a file directive that stood nothing down reports itself; line
directives in a covered file behave as the point above settles. Plus the JS plugin lane in
`packages/devtools/test/downgrade-errors.test.ts`, where the halt behaviour is pinned, and the
lint routing guard in `packages/devtools/test/eslint/routing.test.ts`.

## Docs

`container/website/content/02.runtypes/08.diagnostics/01.error-levels.md` carries the two line
directives today, in "Expecting a Code on One Line" and "Downgrading a Code on One Line". The
file forms belong beside them, one short section, saying which of the three to reach for: the
line when one call site is involved, the per-code file form when the file has a known finding,
the blanket when the whole file is deliberate.

## Out of scope

Modifying any existing file. The suites keep their line directives; this only adds the option.

## Done when

A blanket comment ignores every finding in its file; a per-code file comment stands down what
it names and nothing else, for both directives; a codeless per-code form is refused; a
`LevelError` code reports through every form; a file directive is only recognised at the top of
a file; one that stood nothing down reports itself; its effect on line directives in the same
file is settled and tested; the lint pass routes the new codes; and the docs say which of the
three to reach for and what the blanket costs.
