---
type: feature
spec: guidelines
status: ready
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
