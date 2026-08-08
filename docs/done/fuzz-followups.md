---
type: chore
spec: guidelines
status: ready
created: 2026-08-07
---

# Fuzz follow-ups: the oracle/duplication audit, and the soak timeout

Two fuzz-harness items, consolidated 2026-08-07 from the standalone specs
`fuzz-oracle-and-type-duplication-audit.md` and
`fuzz-soak-timeout-underscoped.md`. Item 1 is investigate-only; item 2 is a
small independent fix that can ship any time.

## Item 1 — Audit the fuzz suites: are the oracles generic, and what types are we duplicating? (chore, guidelines, 2026-08-05)


### Intent

The fuzz lanes look like they carry per-Format / per-Type assertions that belong
in ordinary tests, and they sustain a hand-written parallel type hierarchy that
duplicates shipped types largely to serve those assertions. Before adding
anything else to them, work out whether we are fuzzing correctly.

The principles to measure against:

- A fuzz oracle is a property that holds over the WHOLE generated space — "any
  generated type's mock value validates against that type", "the compiled clone
  equals the reference interpreter". Not "does format X accept string Y"; that is
  a regular test.
- The random type GENERATOR is itself a component that must be correct, and
  deserves its own oracle (a string type can never have children, and so on). Its
  output feeds every other oracle, so a wrong generator quietly weakens all of
  them.
- To check that a type and its equivalent JSON Schema spelling resolve to one id,
  the schema spelling should be emitted BY the generator from a single source of
  truth, not re-derived by a parallel hand-written hierarchy kept in sync by hand.
- An assertion that runs identically on every seed is not a fuzz property.
  `FzUri` pinning the output of the `PresetFormat` / `FormatDefaults` merge is a
  fixed unit assertion in a fuzz costume.

### Direction

Investigate and recommend; do not fix. The implementer plans the changes.

Cover every lane `pnpm rtx core fuzz` exposes: `unit | value | types |
jsonschema | cloning | enrich | i18n | typemod | race | sidecar | patterngen`.

**Classify each oracle** as a generic property or a fixed assertion. Cross-check
against the numbered invariant catalogue in [FUZZING.md](../FUZZING.md) § "The
oracle layer" (O1–O7, TR1–TR4, O15–O17) — that catalogue looks like the right
model already, so the question is mainly which checks live outside it and why.

**Inventory every duplicated definition.** Known starting points:

- `FUZZ_FORMAT_PREAMBLE` in
  [test/fuzz/core/typeGen.ts](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts).
  Note the two tiers are not equally justified: `FzTF` / `FzNot` / `FzString` /
  `FzNumber` restate the raw sentinel encoding (`__rtFormatName` /
  `__rtFormatParams`) the Go scanner reads, which is genuinely independent;
  `FzEmail` / `FzUri` / `FzIri` / … restate post-merge params including whole
  regex sources, and there are nine more of them as of 2026-08-05.
- [test/fuzz/enrich/i18nModel.ts](../../packages/ts-runtypes/test/fuzz/enrich/i18nModel.ts)
  (~line 120) — an inline brand intersection, already flagged as worth revisiting
  in [jsonschema-fuzz-real-module-import.md](../done/jsonschema-fuzz-real-module-import.md).

**Re-examine the blanket no-import rule** in
[test/fuzz/core/srcOverlay.ts](../../packages/ts-runtypes/test/fuzz/core/srcOverlay.ts)
(the header comment, ~lines 14-18). Its stated reason — "importing the shipped
types would compare a type with itself and the convergence check would pass by
construction" — looks overstated. A door row (`readonly uri: Uri`) and the brand
it names are separate declarations, so a wrong mapping still fails against an
imported oracle. Evidence from 2026-08-05: `test/features/formatLengthOverrides.test.ts`
and the whole `test/suites/id-integrity/` suite import shipped brands, and both
caught the `hostname` / `uri` remapping and the `ipv4` params change. What an
import genuinely stops checking is narrower: the post-merge params shape — which
is a fixed assertion, and one leaf proves it as well as nine do.

Read [jsonschema-fuzz-real-module-import.md](../done/jsonschema-fuzz-real-module-import.md)
first for the history: one de-duplication round already ran (it deleted ~10
stand-in brands by putting the real `src/` tree in the resolver overlay) and it
explicitly carved out `FUZZ_FORMAT_PREAMBLE` as "the ONE deliberate exception".
This audit asks whether that carve-out was right; the nine aliases added on
2026-08-05 grew it rather than shrank it.

### A worked example: the id-convergence check

The clearest case, and the one that motivated this todo. The json-schema fuzz
lane asserts, per generated fixture:

```ts
getRunTypeId<FzUri>() === getRunTypeId(jsonSchemaOf({type: 'string', format: 'uri'}));
```

"a format keyword and its type-first spelling resolve to one structural id".

**Why it is not a fuzz property.** The set of format keywords is fixed and small
(16 today). There is nothing to explore: every seed re-runs the same handful of
comparisons, so a random draw is strictly worse than enumerating them — it covers
less and takes longer. Sampling only beats enumeration when the space is too big
to enumerate, and this one is a lookup table.

**It is already a regular test, twice over.**
`test/suites/id-integrity/jsonSchema.test.ts` runs exactly this comparison for
every case in the validation + format-validation suites, and
`test/features/formatLengthOverrides.test.ts` covers the length-sibling variants.
Both are enumerated, both import the shipped brands, and both caught the
2026-08-05 `hostname` / `uri` remapping and `ipv4` params change — the fuzz lane
added nothing the enumerated tests missed.

**What the fuzz lane should keep.** The genuinely unbounded part: that the door
and the type-first spelling still converge once leaves are *composed* — nested
objects, unions, optionality, tuples, `$defs` / `$ref`, negation. That space is
combinatorial and worth sampling. It does not need per-format aliases, only
leaves already known to be equivalent, which is what the enumerated id-integrity
suite establishes.

**The consequence to check.** If the per-format comparison moves out (or is
recognised as already living outside), the per-format `Fz*` aliases lose their
reason to exist and the generator can draw its format leaves from the shipped
brands — which is the duplication this todo is chasing.

### Done when

Every lane's oracles are classified generic vs fixed-assertion, each with a
recommendation (keep / move to a unit test / delete / fold into the generator);
every duplicated type definition is listed with where it should live; a decision
is recorded on the `srcOverlay.ts` no-import rule and on whether
[FUZZING.md](../FUZZING.md) and the root [CLAUDE.md](../../CLAUDE.md) need
correcting; and anything larger than a tidy-up is split out into its own todo
rather than done here.
## Item 2 — Fuzz soak vitest timeouts under-account compile time (clean soaks report as failures) (bug, rough-idea, 2026-08-02)


### Symptom

The opt-in soak tests size their vitest timeout as `soakMs + 60_000`
(e.g. [nonDataTypeFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/type/nonDataTypeFuzz.integration.test.ts)),
but `runTypeFuzzForDuration`'s wall clock overshoots its budget by roughly
2.4x (a 180s budget ran 429s over 742 types; a 60s budget also ran ~429s), so
vitest marks the soak timed-out even though it completes and prints
`soak finished: N types, 0 violation(s)`. Every soak longer than about a
minute therefore reports as a FAILURE while being clean, which cost a
diagnosis round during the binary-union-desync verification (2026-08-02) —
the "failure" perfectly mimics a real finding until the log is read.

### Fix sketch

Either make the duration runner respect wall-clock (check the deadline before
STARTING an iteration and count compile time against the budget), or size the
test timeout from the observed per-iteration cost (`soakMs * 3 + 60_000` is
the cheap fix). Apply to every soak lane that follows this pattern (nondata,
wild type sweep, roundtrip, binary-size). The fixed-iteration batch tests are
unaffected.

### Provenance

Observed 2026-08-02 while verifying the binary-union-function-member-arm fix;
same artifact on 60s and 180s nondata soaks, both with zero violations.

---

# What shipped (2026-08-08)

## Item 2 — done

The fix took the FIRST branch of the sketch, not the cheap one, and applies to
all SEVEN soak lanes rather than the four named (the value / cloning / jsonschema
lanes had the same shape).

Root cause, restated precisely: every duplicated runner spelled
`while (Date.now() < deadline)`, which bounds when an iteration may **start** and
says nothing about when it may **end**. The overshoot is therefore one whole
iteration — unbounded, because a single compile can burn up to
`COMPILE_TIMEOUT_MS` (10s) plus a `tsValidate` program build. `soakMs + 60_000`
was smaller than that tail on the compile-bound lanes.

Shipped:

- [test/fuzz/core/soakBudget.ts](../../packages/ts-runtypes/test/fuzz/core/soakBudget.ts)
  — one budget for every lane. `canStart()` refuses to start an iteration the
  remaining budget cannot pay for, sized against the SLOWEST iteration observed
  (the slow outlier is exactly the one that would blow the timeout). The first
  iteration always runs, since its cost is unknown and a zero-iteration soak
  would report clean without having fuzzed anything. `soakTestTimeout(soakMs)` is
  now the single place the vitest headroom is decided: `SOAK_HEADROOM_MS` is
  180s, replacing the per-file `+ 60_000` / `+ 30_000` literals.
- All five duration runners plus the jsonschema lane's inline one converted.
- All seven soak tests now size their timeout with `soakTestTimeout(soakMs)`.
- 10 unit tests over an injected fake clock
  ([soakBudget.unit.test.ts](../../packages/ts-runtypes/test/fuzz/core/soakBudget.unit.test.ts)),
  in the `unit` lane so they need no binary.

Measured after the change: a 20s `nondata` soak runs 19.8s and no longer trips
the timeout. **The now-honest soak immediately reported 3 real O1 violations in
466 types** — mock values the validator rejects. Filed as
[nondata-soak-o1-mock-validate-disagreement](../todos/nondata-soak-o1-mock-validate-disagreement.md);
it predates this change (the guard does not touch the seeds), it was simply
masked by the timeout failure. That is the clearest possible evidence for why
this item mattered.

Also fixed here, as tidy-ups: the `nondata` / `roundtrip` / `size` lanes had
registered `RT_FUZZ_*_SOAK_MS` vars that **nothing could ever set** — `roundtrip`
and `size` had no lane matching their files at all, and `nondata` ran only under
`types` at its 100-iteration default. All three now have `rtx` entries.

## Item 1 — the audit

Investigate-only, as specified. Nothing below was fixed except two provably
false comments; every actionable item is filed as its own todo.

### Oracle classification, lane by lane

The headline: **the catalogue model in [FUZZING.md](../FUZZING.md) is right, and
the code overwhelmingly obeys it.** Across `unit | value | types | jsonschema |
cloning | enrich | i18n | typemod | race | sidecar | patterngen`, nearly every
assertion is a genuine property over a generated space. The fixed assertions in
fuzz costume are a short, specific list:

| Where | What | Recommendation |
| --- | --- | --- |
| `cloning/cloneFuzz.integration.test.ts:522-526` | object-bearing unions must throw `CES001` — two hand-written types | Move to a unit test. Gains nothing from the fuzz infrastructure. |
| `cloning/cloneFuzz.integration.test.ts:528-537` | a hand-built cyclic value must throw `RangeError` | Move to a unit test. |
| `binary/binaryEncoderResize.test.ts` (whole file) | a regression pin for the encoder-resize bug | Keep, but it is a pin, not a fuzz lane. It is only in `rtx core fuzz all` for historical reasons. |
| `enrich/enrichModel.ts:463,470,477` | three negative probes assert a FIXED malformation yields a FIXED code (`MD001` / `FT002` / `FT005`) | Keep. The malformation is fixed but *when* in a random command sequence it fires is not, which is the part that has value. |
| `core/seededRng.unit.test.ts`, `value/invalidValue.unit.test.ts`, `jsonschema/schemaRender.unit.test.ts` | hand-built graphs and tables | Keep. These are unit tests and are correctly named `.unit.test.ts` — they are not claiming to be fuzz. |

The todo's own worked example holds up, and generalises: **the per-format
id-convergence check in the jsonschema lane is a fixed assertion.** The format
keyword set is a 19-row lookup table, so every seed re-runs the same handful of
comparisons. It is already covered, case for case, by
`test/suites/id-integrity/jsonSchema.test.ts` (24 live string-format convergence
cases) and `test/suites/json-schema-define/loweringTable.test.ts` (53
`getRunTypeId` assertions), and those are STRONGER because they use the shipped
brands rather than a hand-copy. What the fuzz lane uniquely covers is
compositional: a format leaf buried at arbitrary depth under `contains` /
`patternProperties` / `propertyNames` / negation / `$defs`. Nothing in the
enumerated suites does that. **The cut is the per-format leg, not the lane.**

Three findings the brief did not anticipate, all more consequential than the
fixed-assertion tidy-ups:

1. **Every default-run lane uses a frozen literal base seed** (`0xc0ffee`,
   `0x5eeded`, `0xda7a01`, …). `RT_FUZZ_SEED` is read only in the soak / replay
   branches for 9 of 11 lanes (`sidecar` and `patterngen` are the exceptions).
   So in CI the "generic property" oracles re-execute over ONE frozen sample of
   the generated space, forever. The oracles are properties; the *runs* are not
   exploring. Filed.
2. **Two violation-suppressing gates assert nothing.**
   `type/typeFuzzRunner.ts:193-204` and
   `jsonschema/jsonSchemaFuzz.integration.test.ts:164-173` discard ALL violations
   for a type that fails a TypeScript re-check, and the suppression counter
   (`skippedInvalidTypes`) is asserted nowhere — it is only printed in soak logs.
   A generator regression that started emitting 100% invalid TS would turn both
   lanes green and silent. Filed.
3. **`enrich/typeModFuzz.integration.test.ts:86-93` only fails on a
   shrink-confirmed violation**; anything that does not reproduce is logged as a
   flake and passes. A genuinely nondeterministic reconciler bug is unreportable
   by construction. Filed.

Reachability notes worth keeping: `O12` (`checkCrossWire`) is defined in
`value/fuzzOracle.ts:233` but never called by the `value` lane — its only caller
is the non-data path in `type/typeFuzzRunner.ts:454`. `O2` likewise never fires
on the non-data path, which bypasses `runValueOracles` entirely.

### Duplicated definitions — the full inventory

`FUZZ_FORMAT_PREAMBLE` ([typeGen.ts:323-351](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts))
is **18 declarations in two unequal tiers**, exactly as the todo suspected:

- **Tier (a), 4 declarations** — `FzTF`, `FzNot`, `FzString`, `FzNumber` restate
  the raw sentinel encoding (`__rtFormatName` / `__rtFormatParams` / `__rtNot`)
  that the Go scanner reads. Genuinely independent, genuinely earning their
  keep. **Keep.**
- **Tier (b), 14 declarations** — the per-format aliases, each restating the
  result of `PresetFormat<Tag, DEFAULT_X_PARAMS, {}>`. **Eleven carry a full
  transcribed regex source**, four of those multi-kilobyte RFC 3986 / 3987
  grammars. **These are the duplication to retire**, and they lose their reason
  to exist the moment the per-format id-convergence leg moves out.

Three duplications the `srcOverlay.ts` carve-out does not mention, despite
claiming `FUZZ_FORMAT_PREAMBLE` is "the ONE deliberate exception":

- **`typeGen.ts:935-996`, six inline restatements of `src/formats/structural.ts`**
  — `FormattedArray`, `ContainsSlot`, `FormattedObject`, `PatternPropsSlot`,
  `PropNamesSlot`, and a re-derivation of `ArrayLiteralKeys`/`ObjectLiteralKeys`.
  These sit in `renderType`, outside the preamble, so the independence rationale
  never covered them.
- **`enrich/i18nModel.ts:117-121`** — an inline `String<P>` / `TypeFormat`
  spelling. Its stated reason (the temp project has no ts-runtypes install) is
  legitimate, but unlike the preamble it feeds **no convergence check**, so it is
  pure duplication with no compensating benefit. If the encoding changed, the
  i18n fuzzer would silently test a non-format string.
- **`ts-runtypes-devtools/test/helpers/inline.ts:37-105`, `RUNTYPES_DTS`** — a
  hand-written `declare module '@ts-runtypes/core'` stand-in for the entire
  public API (every factory, every `override*`, `RTUtils`, a self-described
  "minimal DataOnly stand-in"). Its own comment calls it a mirror of
  `internal/testfixtures/runtypes.d.ts`, i.e. a copy of a copy. **This is by far
  the largest duplication in the harness**, it is loaded by every fuzz lane, and
  it is entirely unmentioned by the carve-out.

**The copy-drift failure mode the rule warns about has already happened once**,
inside the carve-out: `FzJson`'s `mockSamples` pool had drifted from the shipped
`DEFAULT_JSON_CONTENT_PARAMS` (6 samples vs 7, different content). It broke
nothing — but only because the comment justifying the exactness requirement was
itself wrong.

### Decision — the `srcOverlay.ts` no-import rule

**The todo's reading is correct: the stated reason is overstated, and the
carve-out should shrink to tier (a).** Grounds:

- The rule is not really a no-import rule; it is a no-*stand-in* rule with one
  carve-out, and that framing is right and should stay.
- The independence argument is sound for tier (a) and unsound for tier (b). A
  door row and the brand it names are separate declarations, so an imported
  oracle still fails on a wrong mapping — as `formatLengthOverrides.test.ts` and
  the whole `id-integrity/` suite demonstrate, both of which import shipped
  brands and both of which caught the 2026-08-05 `hostname` / `uri` remapping.
  What an import genuinely stops checking is the post-merge params shape, and
  that is a fixed assertion which one leaf proves as well as fourteen.
- In the jsonschema lane the argument is not even technically load-bearing: the
  whole real `src/` tree — including `stringFormats.ts` and `string-patterns.ts`
  — is ALREADY in that lane's overlay and reachable at
  `./src/formats/string/stringFormats.ts`. The aliases are a choice there, not a
  necessity.
- The carve-out's own claim ("the ONE deliberate exception") is false as written:
  there are four exceptions, and the largest of them is not the preamble.

Recommendation: keep the rule, keep tier (a) under it, retire tier (b), and
rewrite the carve-out paragraph to name all the exceptions honestly.

### Decision — do FUZZING.md and CLAUDE.md need correcting?

**FUZZING.md: yes, substantially. CLAUDE.md: no.** The root CLAUDE.md says only
that `pnpm rtx core fuzz <suite>` is the front door, which is accurate.

FUZZING.md corrections needed (filed, not done here, apart from the two below):

1. `Layout` table (`:27-43`) — every unqualified filename moved into a
   subdirectory (`seededRng.ts` → `core/`, `fuzzOracle.ts` → `value/`, and so
   on), and the whole `jsonschema/`, `roundtrip/`, `binary/size*` and `enrich/`
   trees are absent. The table now contradicts the prose links further down,
   which use the correct paths.
2. `:29` claims `fuzzOracle.ts` holds "the O1-O7 and TR1-TR4 checks". It holds
   no TR check at all — all four live in `type/typeFuzzRunner.ts:240-281`.
3. The oracle table (`:85-96`) omits **O10, O12, O14**, all live, all documented
   only in code comments. It also omits three entire oracle catalogues:
   `O-SIZE-*` (binary size lane), `RT-*` (round-trip lane, 6 ids), and the
   enrich / i18n / typemod rule sets (`R*`, `T*`, `NL/RC/CB/P`) which ride on a
   `rule:` field rather than `oracle:` and so are invisible to the obvious grep.
   The jsonschema lane emits no oracle id at all.
4. The two-tier table (`:225-232`) predates the `valueSource: 'mock'` split.
   Tier B also emits O7 / O10 / O12 / O14 now, and the tier is chosen from actual
   ENCODER behaviour, not from diagnostics — which directly contradicts the
   section's own heading.
5. `:238-241` "no dependency on `createMockDataFn`" is half true: it holds for
   the `shape` value source, not for `mock`.
6. `:272-273` "Not yet generated: branded `TypeFormat` primitives" is stale —
   format leaves have a generator arm gated behind `GenOptions.structuralFormats`.
   Generics / conditional / mapped / template-literal types remain genuinely
   ungenerated.

Two corrections were made in this change rather than filed, because they were
documentation-only and actively false:

- The `Suites:` list (`:139-141`) now matches the registry, and gains a paragraph
  on the soak wall clock.
- The two `FUZZ_FORMAT_PREAMBLE` comments claiming `mockSamples` must match "or
  the ids diverge on the very first draw" now say the truth: mock pools are NOT
  id-relevant (`stringFormats.ts:220`, `resolver/sample_conflict_test.go`). That
  false claim is precisely why the `FzJson` drift went unnoticed.

### Follow-ups filed

- [nondata-soak-o1-mock-validate-disagreement](../todos/nondata-soak-o1-mock-validate-disagreement.md)
  — 3 real O1 violations the honest soak surfaced.
- [fuzz-retire-per-format-aliases](../todos/fuzz-retire-per-format-aliases.md)
  — move the per-format id-convergence leg out of the jsonschema lane and retire
  tier (b), including the four multi-kilobyte regex transcriptions.
- [fuzz-undocumented-type-duplication](../todos/fuzz-undocumented-type-duplication.md)
  — the structural-brand restatements, `i18nModel.ts`, and `RUNTYPES_DTS`.
- [fuzz-frozen-seeds-and-silent-gates](../todos/fuzz-frozen-seeds-and-silent-gates.md)
  — frozen CI seeds, the two unasserted suppression counters, and the typemod
  flake filter.
- [fuzzing-md-catalogue-drift](../todos/fuzzing-md-catalogue-drift.md)
  — the six FUZZING.md corrections above.
