---
type: feature
spec: full-plan
status: ready
created: 2026-08-07
---

# JSON Schema finish line: the consolidated close-out program

One program that finishes every open JSON-Schema item, so the feature stops
accumulating todos. It supersedes and folds in four specs (deleted in the
same commit that adds this one):

- `json-schema-reapply-review-program.md` — the 7-item review program; every
  item re-verified against current main on 2026-08-07, verdicts below.
- `json-schema-dropped-intent-warnings.md` — the lint warning lane (Phase 5).
- `json-schema-optional-sugar-corners.md` — corner 1 verified ALREADY SHIPPED
  by the keyword-first formats program (`TF.base64/base32/base16/jsonContent/
  jsonContentBase64` all exist in src/formats/string/stringFormats.ts:652-675);
  corner 2 (boolean subschemas) is Phase 2 work.
- `playground-json-schema-selector-mode.md` — Phase 6.

Deliberately NOT folded in:

- `typebox-json-schema-document-column.md` — blocked on an unpublished
  TypeBox release; nothing on our side can move it. Stays its own todo.
- `rename-value-first-schema-to-type-builders.md` — a full-plan chore specced
  as its own PR; mixing a repo-wide mechanical rename into a behavior PR
  would swamp review. Stays its own todo.
- The fuzz-harness questions live in `fuzz-oracle-and-type-duplication-audit.md`
  (all lanes, investigate-only); review item 7 defers behind it (see verdicts).

## Recorded verdicts — the review program re-verified on current main

1. **propertyNames duplicate-drop — RE-APPLY (bug confirmed live).**
   The structural id APPENDS all stacked propertyNames children
   (typeid/intersection_collapse.go:247-250, sorted `pn{…}` at :295-297) while
   the serialize collapse OVERWRITES (runtype/intersection_collapse.go:266-268,
   last-lifted wins) and the protocol slot is singular
   (protocol.go:288-291 `PropNames *RunType`) where every sibling slot
   (Negations, Contains, PatternProps, OneOf) is a slice. No test pins the
   stacked case. Re-verification also found **unevaluated* has the identical
   defect** (append at typeid :251-254 vs overwrite at runtype :270-272), plus
   five more machinery gaps — all fixed in Phase 1.
2. **Format definitions out of the mapping file — SUPERSEDED, one residual.**
   fromJsonSchema.ts on current main defines NO jsonContent brand, NO RFC 4648
   presets, NO mock pools, NO StructuralBrand twin (the keyword-first program
   moved everything; verified line by line). Residual: `StructuralBrand` is
   still file-local in src/formats/structural.ts:63-66 — export it once
   (Phase 3 needs it). Two drifts found nearby, fixed in Phase 2: the lowering
   row at fromJsonSchema.ts:2069 claims `flags: ""` while the code compiles
   `flags: 'u'`, and the patternProperties key brand (structural.ts:185)
   hardcodes `flags: ''` while the door's `pattern` uses `'u'`.
3. **StripRunTypeMeta + JsonSchemaType — RE-APPLY (nothing exists).**
   Repo-wide grep finds no annotation-grade projection. The compiler facts
   from the original probing still hold (DataOnly's shape at
   src/runtypes/dataOnly.ts confirms the keep-verbatim discipline; the
   sentinel key set is sentinelKeys.ts's nine symbols). Phase 3.
4. **Official-suite TYPE gate — RE-APPLY, integrated into the lane.**
   test/json-schema-official/ is purely runtime today (no type-level
   assertion anywhere in the lane). Drive the gate from the pinned real-suite
   corpus via the lane's own generator, with the lane's bidirectional-ledger
   discipline. Phase 4.
5. **Mapping trims — split verdicts.**
   (a) minItems padded tuple: CONFIRMED still tuple-padded with a PINNED
   door-vs-builder id divergence (StructuralFormat.ts:11-15 "same checks,
   different encoding (and id)") — RE-APPLY: bare minItems rides the
   FormattedArray param so the three modes converge (Phase 2).
   (b) readOnly → readonly lift: RE-APPLY THE DROP. Zero validation, the id
   moves for a pure annotation, and only property positions lift (root/items/
   combinator positions silently drop the same intent). Dropping it makes
   readOnly a uniform annotation and lets the Phase 5 warning cover it
   uniformly. `RT.propMod({readonly: true})` stays for value-first authors.
   (c) mixed properties + additionalProperties: the TYPE-level over-narrowing
   is CONFIRMED (`{a: string} & Record<string, number>` rejects valid data;
   runtime is correct via additionalOwn since 693d707) — RE-APPLY the type
   fix; it is also a prerequisite for the Phase 4 gate (Phase 2).
   (d) fixed-width format + length sibling: KEEP `never` — emitters still have
   no length-param support outside email/hostname/uri. No change.
6. **Slot encodings for dependentSchemas / dependentRequired / if-then-else —
   DROP (superseded by events).** On current main all three desugar into the
   type shape (fromJsonSchema.ts:1472-1537), the keyword-semantics tests from
   4ca6237 pin the behavior as correct, the conformance lane shows ZERO open
   divergences, and the dependentSchemas interplay with unevaluated* already
   rides `__rtUnevaluated` groups. The re-encoding would win only
   representation (smaller ids/validators for stacked conditionals) at the
   cost of three full slot kits across the whole pipeline. Not worth it while
   behavior is right. What we DO take from this item: the two bug classes it
   predicted are real in the SHIPPED slots and are fixed in Phase 1
   (key-sweep guards + verr/mock/refslot gaps for unevaluated).
7. **Fuzz corpus follow-through — STAYS DEFERRED, re-homed.** Multi-
   propertyNames in the M7 corpus waits for the fuzz-harness cleanup owned by
   `fuzz-oracle-and-type-duplication-audit.md`. Phase 1 pins multi-
   propertyNames with enumerated tests instead, which is the better home per
   that audit's own reasoning (fixed small space → enumerate, don't sample).

## Phases

Work them in order; each phase is committed separately and leaves the tree
green (full JS + Go suites). Marker rule applies throughout: every new suite
touching the marker API covers BOTH `getRunTypeId<T>()` and
`getRunTypeId(value)` shapes, with a hash-equivalence pair per suite.

### Phase 1 — slot machinery hardening (Go + wire + JS readers)

The append-semantics fix plus every real defect the re-verification found:

1. Protocol: `PropNames *RunType` → `PropNames []*RunType`;
   `Unevaluated *UnevaluatedCheck` → `Unevaluated []*UnevaluatedCheck`
   (protocol.go:291, :308). `EachRefSlot` (refslots.go:21-77) gains the
   PropNames list AND the missing Unevaluated children (Value + each group's
   When/WhenNot) — fixing family population, bundle dep collection, per-file
   scope, pattern enrichment and circular skeletons that all miss them today.
2. Serialize collapse appends both slots (runtype/intersection_collapse.go:267,
   :271), matching the id fold. Id fold unchanged → single-instance ids do
   not move.
3. Wire writers (module.go writePropNames / writeUnevaluatedKeys) emit lists;
   JS consumers updated (mockType.ts:809-826 propNames; :718-749 unevaluated
   flatten across specs).
4. Emitters enforce ALL instances: validate.go propNames/unevaluated loops;
   validationerrors.go gains the missing unevaluated arm (defect: verr never
   reports unevaluated violations today) and loops propNames.
5. Mock gating: noop_types.go:548,563 add the unevaluated slot to the
   non-trivial guards.
6. Id/serialize twin asymmetry: memberIDs (typeid.go:655) uses the
   symbol-aware IsNotSentinelPropName like serialize.go:1306 does.
7. writeFooter double-emit of the slot specials in the per-node layout
   (module.go:209-228 then :244) deduped — cosmetic, but it is the file we
   are in.
8. Tests: Go unit coverage for append semantics (id stable across arm order,
   ALL arms enforced — id = behavior); structuralKeywords.test.ts gains
   allOf-stacked propertyNames and stacked unevaluated pins (both marker
   shapes + hash equivalence); existing single-instance suites stay green.

### Phase 2 — mapping corrections (type level, fromJsonSchema.ts)

1. **readOnly lift removal** (verdict 5b): drop ReadonlyPropKeys /
   ObjectFromPropsSplit; readOnly becomes `ignored: annotation` in the
   lowering table; loweringTable.test.ts flips to "id must NOT move";
   recovered-type pins and guide updated (Phase 7 for prose).
2. **Mixed properties + additionalProperties** (verdict 5c): the index
   signature widens to admit declared members —
   `Props & Record<string, From<A> | Props[keyof Props]>` — so valid data
   assigns; runtime unchanged. Compile pin + budget updated.
3. **minItems re-encode** (verdict 5a): bare `minItems` (no prefixItems)
   rides `FormattedArrayParams.minItems` instead of the padded tuple;
   prefixItems keeps the tuple path (required slots), `items: false` keeps
   the closed tuple path. StructuralFormat.ts columns converge (the
   door-authored divergence note goes away), id-integrity converges,
   lowering row updated.
4. **Cross-document $ref rejected at the key**: the guide already claims it
   ("turned down at the key") but the code silently widens to `unknown`
   (RebasedRefFrom :1696-1713, DynRefPart :1829-1833). Make the doctrine
   true: `$ref`/`$dynamicRef` values not starting with `#` error at the key
   via an ExactJsonSchema leg. Doc-vs-code contradiction resolved in favor of
   loud.
5. **Boolean subschemas everywhere** (sugar corner 2): widen `properties` /
   `patternProperties` / `$defs` values and `anyOf`/`oneOf`/`allOf` members
   to accept `true`/`false` (`true` ≡ `{}` ≡ unknown, `false` ≡ never), with
   the boolean-method-key folding bypass on every new leg
   (ExactJsonSchemaMap gains the bypass; the combinator legs take
   ExactJsonSchemaList). FromJsonSchemaIn arms handle boolean at each new
   position (a `false` property value = must-be-absent; a `false`
   patternProperties value = keys matching the pattern are forbidden —
   verify the runtime pattern-props path honors a never value, extend if
   not). Suite rows with both marker shapes + hash pair; budgets.
6. **Pattern flags truth** (verdict 2 residual): fix the stale lowering row
   (`flags: 'u'`), and unify the patternProperties key brand to `'u'` so one
   regex dialect serves both spellings — unless implementation surfaces a
   concrete breakage, in which case document the divergence instead.

### Phase 3 — StripRunTypeMeta + JsonSchemaType (the clean types)

- Export `StructuralBrand` from src/formats/structural.ts (once).
- New extract region (own `#region stripruntypemeta-extract`) implementing
  `StripRunTypeMeta<T>`: wide-brand collapse to the base for branded
  primitives/Date, element inference for branded plain arrays, key-filtered
  homomorphic maps for objects (sentinel symbol keys dropped, values
  recursed), keep-verbatim residuals for branded tuples and branded
  literals, DataOnly's depth discipline (bounded ladder, verbatim below the
  floor). TS has no generic intersection subtraction — the walker never
  tries to subtract patterns.
- `JsonSchemaType<S> = StripRunTypeMeta<FromJsonSchema<S>>`, exported from
  the json-schema subpath.
- Doctrine: mutually assignable with the full type (staticEquivalence
  pins), and NEVER reflected — the metadata IS the validation contract;
  DataOnly stays the reflection-safe projection and keeps sentinels. JSDoc +
  guide state it.
- Budget-ratchet compile tests per the dataonly.compile.test.ts protocol
  (own harness slicing the region; SENTINEL_KEYS_PREAMBLE + assert
  preamble).

### Phase 4 — the official-suite TYPE gate

- Extend scripts/core/gen-json-schema-suite.mjs to emit a type-gate artifact
  beside the runtime modules: for every `ok` group, each spec-VALID sample as
  an assignment `const c: JsonSchemaType<typeof s_i> = <sample literal>;`.
  Negative samples are never asserted.
- A new lane test compiles the batches through the in-process TS API (the
  jsonSchemaHarness MeasurerConfig shape: real bundler resolution against
  the built dist), filtering TS2353 (fresh-literal excess-property check —
  open-world semantics; the suppress flag left TS in 5.5).
- Expected failures ride a bidirectional ledger exactly like
  known-divergences.json (a separate type-gate ledger file, same
  stale-entry-fails discipline), reconciled by the same generator verb.
- CONFORMANCE.md gains the type-gate scoreboard line; README documents the
  gate.

### Phase 5 — the dropped-intent lint lane

- First LOCAL-AST rule in the shared plugin (one module, both hosts):
  `runtypes/json-schema-dropped-intent`, default `warn`. Finds
  `runTypeFromJsonSchema({...})` literals (the prefilter already passes the
  subpath specifier), walks the schema object, and reports:
  `readOnly: true` (any position — uniform after Phase 2), `writeOnly: true`
  (any position), `then`/`else` without a sibling `if`, and
  `minContains`/`maxContains` without a sibling `contains` — each message
  naming the guide's annotations section.
- Mechanics: RULE_SPECS gains a third gate kind (`local`); index.ts grows the
  local-rule factory branch and widens RuleContext with `sourceCode.ast`;
  the oxlint jsPlugin AST is ESTree with parent pointers, and the same
  visitor shape works on ESLint v9.
- The router-only doctrine in the index.ts header gets the documented
  exception paragraph. oxlint-recommended.json + the linting docs table gain
  the rule (plugin.test.ts pins the first).
- Tests: pure-walker units (hand-built ESTree nodes), plugin.test.ts
  adapter coverage, and oxlint-e2e through the real binary; quiet on
  ordinary annotations and on non-schema files.

### Phase 6 — playground: JSON Schema as the third authoring mode

- `Mode` gains `'jsonSchema'` (engine.ts); the call shape is the value-first
  one (`createX(MyType)`); sources carry their own
  `import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema'`.
- Every preset gains a `jsonSchema` variant — all six current presets are
  expressible (verified; Tree recursion via `$ref: '#'`), so no preset needs
  the opt-out tooltip. Variants must converge to the ts variant's id.
- PlaygroundStage: third toggle button (label `JSON Schema`), hint text, and
  the mode-switch re-render path already generalizes.
- Tests: presets.test.ts asserts the variant exists and binds MyType;
  test/playground/jsonSchema.test.ts grows per-preset WASM assertions
  (parses, validates its input, id-converges with the ts form) — superseding
  the removed single-preset test. Playground page description updated.

### Phase 7 — docs and website

- Guide 02.json-schema.md: annotations section rewritten (no readOnly
  exception; the lint warning mentioned), boolean-subschema acceptance,
  minItems encoding note if present, JsonSchemaType section with a real
  `<code-import>` example from packages/examples.
- Formats page: verify the TF content-encoding presets are documented
  (corner-1 supersession check).
- docs/ARCHITECTURE.md: slot append semantics, the clean-types projection +
  never-reflect doctrine, the lint local-rule exception.
- docs/ROADMAP.md: JSON Schema scope closes.
- Website style rules apply (no dash punctuation, MDC/fence counts match
  baseline, prose-only constraints).

### Phase 8 — the gate

- Full `pnpm test`, `go -C ts-go-runtypes test ./internal/...`,
  `pnpm run lint`, `pnpm run format`, `pnpm rtx core codegen all --check`.
- This spec moves to docs/done updated to match what shipped.

## Done when

- Every review-program item carries its verdict above and the re-applied
  ones are implemented; the four folded todos are deleted; the two excluded
  todos still stand on their own.
- allOf-stacked propertyNames and unevaluated* enforce every arm with ids
  stable across arm order (id = behavior).
- JsonSchemaType ships with the never-reflect doctrine documented and
  budget-pinned; the official lane runs the type gate under pnpm test with a
  bidirectional ledger.
- Both lint surfaces warn on dropped schema intent; the playground offers
  type / builder / JSON Schema globally with per-preset convergence pins.
- The PR-readiness gate is green end to end.
