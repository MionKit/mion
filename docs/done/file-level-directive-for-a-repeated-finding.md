---
type: feature
spec: guidelines
status: done
created: 2026-09-18
---

# A file that stands the same code down on every line has no way to say it once

## Intent

Both source directives were LINE-only. `AppliesToLine` was the whole targeting story
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

## What shipped

No new directive word and no new grammar. The SHAPE of the comment picks the scope, which is
how ESLint tells `/* eslint-disable */` from `// eslint-disable-next-line`, so the thing an
author has to learn is one rule rather than a second vocabulary.

| Written as | Where | Covers |
| --- | --- | --- |
| `// @mion-expect-error VL002` | on its own line | the line below (unchanged) |
| `/* @mion-expect-error VL002 */` | before any code in the file | the whole file |
| `/* @mion-expect-error VL002 */` | anywhere lower down | the line below (unchanged) |

Both words get the file scope, the downgrade included: a suite that wants one code visible but
not halting across a whole file is precisely `cloning/Unions.ts`.

The code list is the grammar the line forms already parse. Naming no codes covers every code
the directive may act on, exactly as the bare line form does today. There is no `*` and no
blanket word: one spelling per behaviour.

Settled behaviour:

- **A file directive wins.** It stands down every finding it covers wherever that finding sits.
  When a file and a line directive both claim one finding, expect (remove) beats downgrade
  (keep and mark): a finding cannot be both gone and printed.
- **Line directives under it are not turned into forty stale reports.** Every directive that
  claims a finding is marked used, not just the one whose action won, so the line comments a
  file comment covers each still claim their own finding and earn no `EXP001` / `DWN001`. A line
  comment sitting on a line that raises nothing was already stale before the file comment
  arrived, and is still reported: the file form makes such a comment redundant, it does not make
  it correct.
- **`LevelError` is still never silenceable.** `covers()` already goes through `Suppressible()`
  and `Downgradeable()`, so the file form gets the rule for free and cannot become the one way
  around it.
- **A file directive that stood nothing down reports itself**, as `EXP001` / `DWN001`, the same
  reverse check that keeps a line comment from outliving its problem. TypeScript does not do
  this for `@ts-nocheck` and it is the one place worth departing.

### Where the code went

- `ts-go-runtypes/internal/diagnostics/expecterror.go` — the semantics. New `DirectiveScope`
  (`DirectiveScopeLine` / `DirectiveScopeFile`) and a `Scope` field on `Directive`.
  `ApplyDirectives` keeps its per-line index and adds a per-file one; every claimer of a
  finding is marked used, so a line comment under a file comment is not then called stale.
- `ts-go-runtypes/internal/compiler/resolver/expecterror.go` — the syntax. `directiveBody`
  reports whether the comment was written as a block comment, and `firstCodeOffset` finds where
  the file's code begins by walking the comment spans the lexer already produced. A block
  comment ending at or before that offset is a file directive.
- `PassScope`, `settleDiagnostics` and `directiveScope` needed no change, so the file form
  settles a finding for the bundler build, `mion compile` and the editor at once, and the lint
  pass still judges only the files it looked at.

### No new diagnostic codes

`EXP001-003` and `DWN001-004` already say everything a wrong file directive needs to say, so
`PREFIX_TO_FAMILY` in `packages/devtools/src/lint/diagnosticRouting.ts` needed no new row,
`oxlint-recommended.json` no new rule, and the generated catalog no regen. The two rule
descriptions were extended to say they cover both scopes.

## Known cost of the codeless form, accepted

A block comment at the top with no codes hides findings nobody has met yet, including a real
one introduced later, which is what `downgradeErrors: '*'` did before the run-types configs
stopped using it. That is understood and intended: it is opt-in per file and visible at the top
of it, rather than a project-wide setting nobody reads. The docs are direct about the trade and
point at the per code form as the tool that keeps the rest of the file honest.

## Tests

`ts-go-runtypes/internal/compiler/resolver/filedirective_test.go`, fourteen cases through the real
scan, mirroring the shape of `expecterror_test.go` and `downgradeerror_test.go`: a codeless
block comment stands the whole file down; a named one stands down what it names and lets
everything else through; a file expect covers a line downgrade under it while a file downgrade does not cover a stale line expect; the downgrade form marks every site and leaves the wire level alone; a
second file in the same program still reports normally; a `LevelError` code is refused through
both forms; a block comment below the top is still a line directive; a line comment at the top
is still a line directive; a file directive that stood nothing down reports itself; covered line
directives are not judged and uncovered ones still are; expect beats downgrade. Both
`getRunTypeId` call shapes ride in every fixture and `TestFileDirective_FormEquivalence` asserts
the pair resolves to one entry while a file directive is in force.

Six of the fourteen fail without the change; the rest are the pins that the line forms and
the rewrites behave exactly as they did.

`packages/devtools/test/downgrade-errors.test.ts` adds three fixtures for the plugin lane: a
file expect removes the finding at both sites with no halt, a file downgrade prints
`warning VL002 (downgraded)` with no halt and no `error VL002`, and an unused file directive
surfaces as `warning EXP001` without halting.

`packages/devtools/test/eslint/routing.test.ts` gains the explicit `EXP` / `DWN` routing cases
it was missing; they were only covered implicitly by the catalog loop before.

Not a fuzz candidate: a comment parser has no cheap oracle (no round trip, no second
implementation to compare against) and its input space is a short grammar the table tests cover
directly.

## Docs

`container/website/content/02.runtypes/08.diagnostics/01.error-levels.md` had one section per
directive per scope, which is three sections saying nearly the same thing. They collapse into
one, "Disabling Errors": what each word does, a line comment covers the line under it and a
block comment before any code covers the file, one table for the three shapes, and the codeless
form with what it costs.

The example is a real file, `packages/examples/src/guide/disabling-errors.ts`, pulled in with
`<code-import>` so the root typecheck fails on drift. It carries all three forms with comments
around them, and the resolver run over it prints exactly what the page claims: the two calls the
file comment covers report `warning VL002 (downgraded)`, the one the line comment covers reports
nothing, and the build exits zero.

## Out of scope

Modifying any existing file. The suites keep their line directives; this only adds the option.

## Where this departed from the original direction

The spec asked for three new words: `@mion-nocheck` for the blanket and a `-file` (or `-all`)
suffix on both line directives. It also asked for a codeless per code form to be refused, and
for a file directive written below the top to be reported.

None of that shipped. The decision, taken during planning, was to add no new vocabulary at all
and let the comment shape carry the scope, because that is the rule ESLint users already know.
Three consequences follow:

- There is no blanket word. A block comment at the top with no codes IS the blanket, and it
  reads as the file-scope twin of the bare line form rather than as a fourth thing to learn.
- There is no `*`. An empty code list already means "any code", so `*` would have been a second
  spelling for it.
- A block comment below the top is NOT reported. It stays the line directive it is today, which
  keeps the change backward compatible for anyone already writing the block form. The trade is
  that an author who meant a file directive and put it after an import gets a line directive and
  is not told; the top of a file is where a reader looks for one, and where the docs put it.
