---
type: feature
spec: guidelines
status: ready
created: 2026-09-06
---

# Let failOnError downgrade named diagnostic codes

The conclusion here is deliberately provisional. It came out of a design discussion, not a bug,
and nothing is blocked on it. Whoever picks it up should re-read the reasoning below and decide
again, because the strongest argument in it is an argument for doing LESS than the conclusion
proposes.

## Problem

A team that hits a diagnostic they cannot fix right now has exactly one lever, and it is a
sledgehammer.

`failOnError` (a `@mionjs/devtools` plugin option, also readable as a tsconfig key) decides
whether Error-severity diagnostics halt the build. It is a boolean over the whole catalog: 68
Error codes and 16 Warning codes at the time of writing. So the choice is "fail on everything"
or "fail on nothing", and a team blocked by one code in one corner of their tree has to drop
strictness for the entire project to ship.

There is no finer mechanism anywhere. Confirmed by reading the tree: no per-site suppression
comment, no per-code ignore list, no group or family filter, in either the Go program or the JS
plugins. `failOnError` is the entire surface.

## Background: how the system actually works

Worth stating, because the obvious fixes fall down on these facts.

- The compiler has no concept of a lint rule. It emits diagnostics: a code, a severity, a
  family, args and a site. Rule names exist only in the JS lint plugin, which maps code prefixes
  to rule names in `packages/devtools/src/lint/diagnosticRouting.ts`.
- Which diagnostics you get is decided by what work was requested, never by a rule list. The
  `protocol.Request` struct carries no rules field. `IncludeEntryModules` / `IncludeRtDiagnostics`
  gate the RunType family, `CheckEnrich` gates the enrichment family, and the marker, pure-fn and
  batch families come out of the scan unconditionally.
- Turning a rule off in an eslint or oxlint config does not stop the compiler producing the
  diagnostic. It only stops something reporting it. The build path never consults that config.
- Severity is informational. `ts-go-runtypes/internal/diagnostics/catalog.go` says so directly:
  an Error-severity diagnostic still lets the build proceed, and the runtime factory is still
  rendered. What acts on severity is the consumer: `mion compile` turns it into an exit code, the
  bundler plugin's `failOnError` turns it into a halt.

## Two options that were considered and rejected

### A per-code or per-group suppression list

The intuitive fix: let the build config name codes to ignore.

**For it:** precise instead of nuclear. Groups would map cleanly onto the existing code-prefix
and family structure, so the config would read naturally.

**Against it, and this is the stronger case:**

These are not style rules. The catalog is explicit that an Error-severity diagnostic still
renders the runtime factory, which "may throw on first call". So suppressing, say, a
`validate-non-serializable` error does not fix anything. It ships a validator that throws at
runtime with the warning hidden. The codes most tempting to suppress are exactly the ones most
expensive to ignore, and a suppression list is an invitation to do that.

It also creates a drift class that does not exist today. Right now a rule is configured in one
place, the lint host. Add compiler-side disabling and a rule can be off in eslint and on in the
build, or the reverse, with two files to reconcile and no single answer to "is this on".

Per-line suppression is worse again: it needs comment parsing in Go, which is new machinery, plus
a precedence story against the `eslint-disable` comments that already exist for the same finding.

### New `lint-error` / `lint-warn` severity levels

The idea: distinguish lint-only findings from real compiler faults by giving them their own
severity.

**Against it:**

The codebase has already made this call twice, in the other direction. `Definition` in
`catalog.go` carries two policy bits, each documented as "ORTHOGONAL to Severity":
`Completeness` (an unfilled scaffold rather than wrong content) and `Transient` (a verdict that
depended on machine load). Both stay Severity-Error and are expressed as separate fields.

Severity is also pinned to an external contract. `SeverityLabel` returns "the canonical lowercase
string used by `tsc --pretty=false` and VS Code's `$tsc` problem matcher". A `lint-error` label is
not something that matcher recognises, so editor problem-matching would quietly degrade.

And it would fail silently in our own code. Five places test for Error severity: four in
`packages/devtools/src/core/unplugin.ts` (two `surfaceDiagnostics` halt predicates, the
completeness filter, the error counter) and one in `ts-go-runtypes/cmd/mion/main.go` that sets the
exit code, plus a `switch` arm on `Severity.Error` for rendering. A new enum value does not error
at any of them, it just stops matching, so builds would quietly stop halting.

Finally it conflates two independent axes, "how bad is it" and "who should act on it", so the
enum grows multiplicatively as soon as anyone wants `lint-info`.

**If that axis is ever genuinely needed**, the cheap version is a `LintOnly bool` on `Definition`
alongside `Completeness` and `Transient`. Those bits are NOT on the wire: `Diagnostic` carries
only code, family, severity, args, site and related. They live in the catalog, which is generated
into TypeScript, so consumers read them by code lookup and the protocol never changes.

## Proposed direction

Make the existing knob finer rather than adding a second configuration surface:

```ts
failOnError?: boolean | string[]   // codes to downgrade from Error to Warning
```

Why this shape:

- **One surface.** It stays the single key that already answers "what fails my build", so there
  is no second place to look and no drift between two configs.
- **It downgrades, it does not hide.** The finding is still reported, still visible in the editor
  and in CI output. That is the difference between "unblock me" and "make this problem invisible",
  and it is the whole reason to prefer it over a suppression list.
- **It matches the real need.** Teams do not want to turn checks off, they want to ship while one
  known issue is outstanding and stay strict everywhere else.

Precedence should follow the existing tsc-style rule already implemented for the boolean: the
explicit plugin option wins, then the tsconfig key echoed on the generate response, then the
built-in default of `true`.

## Open questions for whoever picks this up

Genuinely open. Re-evaluate rather than assume the above.

- **Is the problem real yet?** No one has hit it. This came out of a design discussion. If no
  team has been forced to set `failOnError: false` because of a single code, the honest answer may
  be to do nothing and close this.
- **Should the CLI get the same thing?** `mion compile` has its own exit-code logic and no
  `failOnError` equivalent. Matching the two would mean a new CLI flag, which reopens the
  "second surface" objection this proposal exists to avoid.
- **Does the downgraded diagnostic need to be visibly marked as downgraded?** A warning that was
  configured down reads the same as one that was always a warning, which could mislead.
- **Should there be a way to list what is currently downgraded?** Without it a stale entry in the
  list silently outlives the problem it was added for.

## Done when

Either the option ships with tests covering the three precedence cases and a downgraded code
appearing as a warning rather than halting the build, or this document is closed with a note
saying the problem was judged not worth solving. Both are acceptable outcomes; leaving it open
and unexamined is not.
