---
type: fix
spec: guidelines
status: done
created: 2026-08-07
completed: 2026-08-07
---

# `format: email` accepts a TLD-less domain, diverging from `Email` and AJV

Found while measuring the JSON Schema cost report
([05-cost-and-direction-report.md](../investigations/json-schema/05-cost-and-direction-report.md)),
not while looking for it. It is a live defect, not a recorded limitation.

## What fails

The benchmark correctness pass fails on exactly one ts-runtypes case at
`0a7317c`, in both metrics:

```
ts-runtypes / JSON_SCHEMA.string_email [validate]:          fail — invalid[1] accepted
ts-runtypes / JSON_SCHEMA.string_email [validationErrors]:  fail — invalid[1] accepted
```

`invalid[1]` is `'missing@tld'`, from
[container/benchmarks/shared/cases/format-validation/JsonSchema.ts](../../container/benchmarks/shared/cases/format-validation/JsonSchema.ts).
So `{type: 'string', format: 'email'}` through the schema door accepts an
address that the native `Email` brand rejects.

The same run at the pre-JSON-Schema baseline (`10145c36`) has **0 failures**
across 266 cases, so this arrived inside the JSON Schema window.

## Why it is a real divergence, not a bad test

The case carries a comment recording that `'missing@tld'` was checked against
`addFormats(ajv, {mode: 'full'})` **by running it, not by reading the source**:
AJV in full mode requires the dotted TLD exactly as our `Email` does. The
looser regex that accepts a bare TLD is ajv-formats' *default* mode, which the
lane does not use. So the reference implementation and our own value-first
brand agree with each other, and only the schema door disagrees.

## Likely cause

`8074ab4d` (`feat(formats): finish the format bucket — regex, rfc 5321 email,
rfc 3339 time`) moved email onto RFC 5321 semantics. RFC 5321 permits a bare,
dot-less domain, so the letter-of-the-RFC engine is strictly more permissive
than the practical default that `Email` has always applied. Confirm this is the
mechanism before fixing — the mapping from `format: email` to its emitter is in
[fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts)
and the engine in
[string-formats-pure-fns.ts](../../packages/ts-runtypes/src/formats/string/string-formats-pure-fns.ts).

## The decision this needs

This is why it is filed rather than patched: it is a semantics question, not a
typo. Two doors reach one concept and now disagree, and either answer is
defensible.

- **Converge on the strict default** (dotted TLD required, matching `Email` and
  AJV full mode) and treat RFC 5321's bare-domain allowance as out of scope.
  Restores the invariant that both doors to a format are id-convergent and
  behaviour-identical, which the rest of the keyword-first work went to some
  trouble to establish.
- **Keep RFC 5321 for the schema door** and accept a documented divergence.
  Then the divergence ledger must record it, and the benchmark case needs its
  expectation split per door.

Whichever is chosen, the general rule is worth writing down with it: when a
spec's letter and the practical default disagree, which one wins. This will
not be the last format where they do.

## Done when

- One decision above is taken and recorded.
- `format: email` and `Email` agree, or the divergence is documented in the
  ledger and the benchmark case reflects it per door.
- The JSON Schema correctness lane is back to 0 failures.
- A test pins the chosen semantics for `'missing@tld'` on **both** doors, so
  they cannot drift apart again silently.

## Shipped record

**Decision: converge on the strict default.** A named domain must be dotted —
`format: email` / `format: idn-email` (EmailAddress / IdnEmail) now reject
`'missing@tld'` exactly as the native `Email` pattern and AJV full mode do.
RFC 5321's bare-domain allowance is out of scope on purpose; address literals
(`joe@[127.0.0.1]`) are untouched, and `format: hostname` still accepts a
single label, because a HOST NAME legitimately is one.

**The general rule, recorded:** when a spec's letter and the practical default
disagree, the practical default wins. A format exists to validate real-world
values, not to certify RFC grammar; the letter-of-the-spec reading is adopted
only where the official JSON Schema Test Suite pins it. (The suite is silent
on the TLD-less domain — every valid email sample it carries is dotted or a
bracketed literal — which is exactly why this one slipped through the
conformance lane and surfaced only in the benchmark correctness pass, whose
case data checks `'missing@tld'` against AJV full mode by running it.)

**Where it landed:**

- The engine: `rtFormats::isEmailAddress` in
  [string-formats-pure-fns.ts](../../packages/ts-runtypes/src/formats/string/string-formats-pure-fns.ts)
  gains the dotted-domain gate on the named-domain branch (the ASCII door
  checks `'.'`, the idn door any of the wide label separators), with the
  decision cross-referenced in the factory comment.
- The pin: `rfcFormats.test.ts` asserts `'missing@tld'` rejected on the schema
  door, the idn door, and the native `Email` brand in one test, plus the
  trailing-dot and address-literal edges.
- The official suite stays green (no ledger entry needed — the suite never
  asserts the bare-domain case either way), and the benchmark correctness
  lane's `JSON_SCHEMA.string_email` case now passes as written.
