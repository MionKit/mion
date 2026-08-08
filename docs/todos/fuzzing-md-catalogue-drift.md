---
type: docs
spec: full-plan
status: ready
created: 2026-08-08
---

# FUZZING.md has drifted from the harness: stale layout, three missing oracle families

Split out of the [fuzz-followups audit](../done/fuzz-followups.md) (2026-08-08).
The audit's verdict on [FUZZING.md](../FUZZING.md) was that its *model* is right
— the numbered invariant catalogue is the correct way to think about the harness
— but the document has fallen behind the code in six specific ways. The root
[CLAUDE.md](../../CLAUDE.md) needs no correction; its one claim (that
`pnpm rtx core fuzz <suite>` is the front door) is accurate.

Two corrections already landed with the audit and are NOT repeated here: the
`Suites:` list, and the soak wall-clock paragraph.

## The six

1. **The `Layout` table (`:27-43`) has stale paths and is roughly 60% short.**
   Every unqualified filename has moved into a subdirectory: `seededRng.ts` →
   `core/`, `invalidValue.ts` / `fuzzOracle.ts` / `fuzzRunner.ts` /
   `fuzz.integration.test.ts` / `shapeValue.ts` → `value/`,
   `binaryEncoderResize.test.ts` → `binary/`, `typeGen.ts` → `core/`,
   `typeFuzzHarness.ts` / `typeFuzzRunner.ts` / `typeFuzz.integration.test.ts` →
   `type/`. The table now contradicts the prose links further down (`:200`,
   `:222`, `:240`), which use the correct paths.
   Entirely absent: the `jsonschema/`, `roundtrip/`, `binary/size*` and
   `enrich/` trees; `core/soakBudget.ts`, `core/runTypeGen.ts`,
   `core/srcOverlay.ts`; `type/nonDataTypeFuzz.integration.test.ts`,
   `type/mockSeedFuzz.ts`, `type/tsValidate.ts`, and the five `type/*.smoke.test.ts`
   pins.

2. **`:29` is factually wrong.** It says `fuzzOracle.ts` holds "the O1-O7 (value)
   and TR1-TR4 (resolver/emit) invariant checks". It holds no TR check at all —
   it only declares them in the `OracleId` union (`:75-78`). All four live in
   `type/typeFuzzRunner.ts:240-281`. The same line omits O12, which IS
   implemented there (`:233`).

3. **The oracle table (`:85-96`) omits three live ids and three whole
   catalogues.**
   Missing ids: **O10** (collapse ⇒ Error diagnostic,
   `typeFuzzRunner.ts:442`), **O12** (cross-wire, `fuzzOracle.ts:233`), **O14**
   (JSON and binary agree on serialize-vs-alwaysThrow, `typeFuzzRunner.ts:431`).
   All three carry documented invariants in code comments (`fuzzOracle.ts:53-56`)
   and none is in the catalogue.
   Missing catalogues: `O-SIZE-ROUNDTRIP` / `O-SIZE-GREW` (`binary/sizeOracle.ts:27`);
   the six `RT-*` ids of the round-trip lane (`roundtrip/roundtripOracle.ts:38`);
   and the enrich / i18n / typemod rule sets (`R*`, `T*`, `NL/RC/CB/P`), which
   ride on a `rule:` field rather than `oracle:` and are therefore invisible to
   the obvious grep. The json-schema lane emits no oracle id at all — worth
   giving it one while here.

4. **The two-tier table (`:225-232`) predates the `valueSource: 'mock'` split.**
   Tier B is described as O1-O7 / O3-O4′ only; it now also emits O7 (uncontrolled
   encode), O10, O12 and O14. More importantly the tier is chosen from the actual
   **encoder behaviour**, not from the resolver's diagnostics — the code comment
   at `typeFuzzRunner.ts:395-399` says so explicitly, and it contradicts the
   section's own heading ("chosen from the resolver's own signals").

5. **`:238-241` is half true.** "The value streams come straight from the
   abstract type … so no dependency on `createMockDataFn`" holds for the `shape`
   value source only. The `mock` source drives values from the real
   `createMockDataFn` with `nonDataTypes` on. The `ValueSource` split is not
   mentioned anywhere in the doc.

6. **`:272-273` is stale on its first item.** "Not yet generated: branded
   `TypeFormat` primitives" — `core/typeGen.ts` has a format-leaf arm (`:64`), a
   `FORMAT_LEAF_NAMES` picker (`:742`), a not-of-format arm, the
   `FUZZ_FORMAT_PREAMBLE` block and renderer arms, all gated behind
   `GenOptions.structuralFormats`, which the json-schema lane turns on. Generics
   / conditional / mapped / template-literal types remain genuinely ungenerated,
   so trim the item rather than deleting it.

## Also worth adding while in there

- The `Findings` section (`:16-19`, `:178-187`) lists exactly one finding. At
  least one newer filed finding exists
  ([nondata-soak-o1-mock-validate-disagreement](nondata-soak-o1-mock-validate-disagreement.md)).
- `:172-176` ("Adding a target") describes only the Phase-1 builder corpus, not
  the `getRunType<T>()` type-argument form the cloning corpus uses, which is now
  the more common pattern.
- The "Recursive types run Tier A only" limitation (`:257-263`) should
  cross-reference `:129`, which notes the cloning lane DOES fuzz circular types
  end-to-end with tree-shaped mock values.

## Done when

All six are corrected, the layout table matches the tree, and every oracle id the
code emits appears in the catalogue (or is deliberately excluded with a stated
reason).
