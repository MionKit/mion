---
type: feature
spec: guidelines
status: done
created: 2026-09-03
---

# Check user-defined format patterns for catastrophic backtracking at build time

## Intent

A `pattern` format (`TypeFormat<string, 'pattern', {pattern: '...'}>`, the `rt.string().pattern()`
builder, and every custom string format that carries a regex source) ends up as a `new RegExp`
literal in the generated validator, run on every value the validator sees. A pattern with nested
quantifiers or overlapping alternations (`(a+)+$`, `(a|a)*b`) takes exponential time on a crafted
string, so a type author can ship a validator that an attacker stalls with a short input.

Today the only guard is the sidecar's per-sample time budget: `MATCH_BUDGET_MS` in
`packages/go-be-sidecar/src/jobs.ts` runs each pattern against its mock samples under a `vm`
timeout, on V8 only (JavaScriptCore does not interrupt a running regex, so under bun the guard is a
no-op). It catches a pattern that is slow on the samples it happens to have, not a pattern that is
slow on the input an attacker picks, and a loaded machine once turned a fine pattern into a
build-halting FMT002 (fixed separately: a timeout is no longer cached). RegExp values are no longer
serializable data, so the pattern format is the one place a regex reaches a validator.

## Direction

The implementer plans the details. Constraints and pointers that were checked:

- **Static check, not a timer.** Detect the known slow shapes from the pattern source: a quantified
  group whose body can match the empty string or is itself quantified (`(a+)+`, `(a*)*`), and
  alternations whose branches can match the same prefix under a quantifier (`(a|a)+`, `(\w|\d)+`).
  A published detector (safe-regex style star-height, or an NFA ambiguity walk) is fine to port;
  keep it in Go under `ts-go-runtypes/internal/` next to the pattern compile check so it runs once
  per pattern at build time, on every host.
- **Severity.** A detected shape is an Error diagnostic (the build fails; the validator would be a
  denial-of-service hole), with a new FMT code in `ts-go-runtypes/internal/diagnostics/` and its
  catalog entry. Offer an escape hatch on the format params (`unsafePattern: true` or similar) for
  the rare pattern the detector flags wrongly, documented on the type formats page.
- **Keep the runtime budget.** The sidecar sample check stays as the second layer for what a
  static check cannot see; note the bun gap in the docs.
- **Shipped patterns.** Every literal under `packages/run-types/src/formats/` must pass the new
  check; the `secformat` fuzz lane already pumps them and stays the runtime proof.
- **Tests.** Go table test over slow and safe shapes; a devtools test that a slow `pattern` format
  reports the Error at the marker site; the website type formats page states the rule.

## Done when

- A slow pattern in a format fails the build with a named diagnostic on every host, bun included.
- Every shipped format pattern passes the check.
- The type formats page documents the check and the escape hatch.

## Plan, as built (approved 2026-09-04)

### The check

`ts-go-runtypes/internal/regexsafety/`, pure Go, no new dependencies. Four files: a JS
regex parser (`parse.go`), a Thompson NFA with the epsilon steps KEPT (`nfa.go`), the
ambiguity walk (`eda.go`), and the `Check(source, flags)` entry point.

It is an **NFA ambiguity walk, not a star-height check**. The safe-regex style rule (flag a
quantifier nested inside a quantifier) was tried first and rejected: it flags shipped
patterns that are perfectly fine, so it cannot meet this spec's own "every shipped format
pattern passes" bar. Both of these have star height 2 and are unambiguous:

```
^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$   DOMAIN_PATTERN
^(?:\/(?:[^~\/]|~[01])*)*$                                              JSON_POINTER_PATTERN
```

What the walk actually asks: can the machine return to a state it has already been in,
having read the same text, along two DIFFERENT routes? It runs the automaton against
itself, a state of the product being a PAIR of states, one per route, and a step moving
both routes on the same character. A pair whose halves have drifted apart, sitting on a
cycle that passes back through a pair where they agree, is the proof. Plus one exact rule
handled separately because the wording is clearer: a loop whose body can match the empty
string.

Three modelling decisions carry the accuracy:

- **The epsilon steps stay.** `(a+)+` and `a+` accept the same language and differ only in
  how many ways the automaton can spell one string, so an automaton with its epsilon steps
  closed away cannot tell them apart. The walk counts how many distinct epsilon routes
  reach each character step, capped at two, and a doubled route is itself a finding.
- **`X{n}` is spelled out**, up to 64 copies. An exact count is what makes `%[0-9A-Fa-f]{2}`
  unambiguous, and collapsing it invents ambiguity that is not there.
- **`X{n,m}` becomes nested optionals**, `(X(X)?)?` rather than `X?X?`, so one X still has
  exactly one way to match. Getting this right is what keeps the domain and hostname
  patterns, whose labels are `{0,61}`, out of the report. A bound wider than 64 falls back
  to an open loop.

Constructs the package cannot model (a backreference, a Unicode property this Go build does
not know, the `v` flag) are kept DISTINCT rather than assumed to overlap, so an unmodelled
pattern comes back clean instead of failing a build on a guess. `\p{...}` otherwise resolves
through Go's own `unicode` tables, so property escapes intersect exactly.

**Exponential blowup only.** Polynomial cases (`a*a*`, `\s*\s*$`) are deliberately not
detected: much milder, and far more likely to flag legitimate patterns.

### Wiring

- `validatePatternSafety` in
  `internal/cachegen/typefunctions/formats/string/pattern.go`, called from the same two
  places `validateSamples` is: `namedPatternValidate` there, and `stringConditions` in
  `stringformat.go`. It needs no JS engine, so it runs on every host, bun included.
- **FMT008** (`CodeFMTPatternUnsafe`), FamilyRunType, SeverityError, NOT transient: a static
  verdict is a property of the pattern, so caching it is correct, unlike FMT007's.
- **Escape hatch `unsafePattern: true`**, inside the pattern object. TS side on
  `StringPatternArgs` and mirrored on `FormatPattern`; `EmailParams.pattern`,
  `UrlParams.pattern` and `DomainParams.pattern` were unified onto `PatternParam` so the
  flag reaches them too. Recovered on BOTH scanner channels: the resolved type
  (`formatPatternFromType`) and the call AST (`formatPatternFromObjectLiteral`). It is
  id-relevant, so a checked and an opted-out pattern never share a cache entry, which would
  otherwise make the verdict depend on scan order (the FMT006 trap).
- It is a lint rule for free: `packages/devtools/src/lint/diagnosticRouting.ts` already
  routes the whole `FMT` prefix to `runtypes/format`, so FMT008 is an editor squiggle as
  well as a build failure. Only that rule's description string needed updating.
- The sidecar's sample time budget is untouched and stays the second layer.

### Tests

- `internal/regexsafety/regexsafety_test.go`, a table over slow and safe shapes.
- `internal/regexsafety/shipped_patterns_test.go` reads every registered pattern out of
  `packages/run-types/src/formats/` and expects all 27 to come back clean.
- `internal/compiler/resolver/format_pattern_safety_test.go`: FMT008 at the marker call
  site, the escape hatch silencing it, and a dense safe pattern staying quiet.
- `packages/devtools/test-fixtures/fmt008/` and `fmt008-optout/` with two cases in
  `packages/devtools/src/vite/buildFailure.spec.ts`, so a real `vite build` proves both
  directions.
- `packages/run-types/test/features/unsafePatternOptOut.test.ts` for the TS surface, both
  `getRunTypeId` call shapes included.

No fuzz lane was added. The `secformat` lane already pumps the shipped patterns and stays
the runtime proof, as the direction above says.

### Docs

The type formats page states the check and the escape hatch, the pure functions page states
it for `registerFormatPattern`, and `packages/examples/src/guide/custom-format-pattern.ts`
shows the flag on a real registration.

### Known limits

- A backreference is not modelled, so `^(\w+)-\1$` style backtracking is not detected. The
  sidecar's sample budget remains the only guard there.
- Polynomial blowup is out of scope, by decision.
- A pattern past the walk's size caps (4000 automaton states, a 320-state loop, or a 12M
  comparison budget) gets the empty-loop rule only. No shipped pattern comes close: the
  largest, IRI_REFERENCE_PATTERN at 2 KB of source, builds 268 states.
