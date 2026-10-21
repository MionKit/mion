---
type: feature
spec: guidelines
status: done
created: 2026-09-25
---

# Investigate quiet-by-default diagnostics for the linter and the build

## Intent

The linter reports every diagnostic the resolver emits, at `error` or `warn`, with nothing off by
default. Some findings are expected and correct, so reporting them everywhere is noise:

- **Dropped members.** A validated or serialized type with a method or a function property gets a
  warning per member (`validate-skipped-member`, `json-skipped-member`). That drop is the documented
  contract, so a real codebase can collect a lot of these.
- **Advice, not problems.** A planned rule warns when a route returns a drizzle type instead of the
  mion model type. It should never affect a build, and some teams will not want it at all.

Find out how a user should get findings that are quiet by default, and pick one. Doing nothing is a
valid answer if the current tools are enough.

## Direction

The implementer investigates and plans. What exists today:

- **Every diagnostic reaches the linter.** The resolver checks a file once and returns all its
  diagnostics; `packages/devtools/src/lint/diagnosticRouting.ts` gives each code exactly one rule,
  and each rule reports only its own. A rule set to `off` in the lint config reports nothing.
  Read `packages/devtools/src/lint/CLAUDE.md` first.
- **No rule starts off.** `RuleSpec.default` is only `'error' | 'warn'` (14 and 14 rules today), and
  `configs.recommended` turns every rule on.
- **The build ignores lint config.** It prints the same diagnostics. Its only knobs lower things:
  the `downgradeErrors` option (`packages/devtools/src/options.ts`) and the `@mion-expect-error` /
  `@mion-downgrade-error` comments. A real Error can never be lowered. The Go catalog has three
  levels (Error, RuntimeError, Warning) and none of them means "lint only".

**The proposal to evaluate first: an Info level, plus a setting for which levels to show.**

- **Info, a fourth level below Warning.** The catalog already has a level between Error and
  Warning (RuntimeError). Info sits below Warning the same way: technically a warning, never stops
  a build, but lower priority. Expected drops (`validate-skipped-member`, `json-skipped-member`)
  and advice (the drizzle route rule) move to Info. Touches the Go catalog, the wire `Severity`,
  routing, and how the build prints it (quietly, or only a count).
- **A setting that picks what the linter shows**, by level and by kind. For example, in the lint
  settings:
  ```js
  settings: {mion: {levels: ['error', 'runtimeError', 'warning']}}   // Info hidden
  settings: {mion: {levels: 'all'}}                                  // Info shown too
  ```
  Default: Info hidden. Decide whether the same setting also exists for the build, next to
  `downgradeErrors`, and whether "kind" means the rule (already `off`-able) or a family.
- **Where the filter runs.** Either the lint side drops what the setting hides, or the lint session
  sends the setting to the resolver through `LintSessionOptions`
  (`packages/devtools/src/lint/session-protocol.ts`) and the resolver skips those checks, which
  also saves the work.

Alternatives to compare it against:

1. **Do nothing.** Users turn rules off in their lint config and silence lines with comments.
   Check whether that is enough, and whether the build output is already too noisy.
2. **An `off` default in `RuleSpec`.** Some rules stay out of `recommended` until a user turns them
   on. Lint side only, and per rule rather than per level; the build still prints them.
3. **A build-only option** to hide a warning family from build output, next to `downgradeErrors`.

Measure before deciding: count the warnings on a real project (the examples package and the drizzle
e2e trees are candidates) to see which codes are the noisy ones.

## Decisions (investigation done, 2026-09-27)

**Picked: an Info level, hidden by default, shown with `levels: 'all'`.** The filter runs on the JS side:
filtering in Go saves no work, because the skipped-member codes fall out of the code generation the error codes
need anyway (`Walker.EmitDiagnostic`, `ts-go-runtypes/internal/cachegen/typefunctions/walker.go`).

- **Lint:** `settings: {runtypes: {levels: 'all'}}` (the existing `settings.runtypes` namespace, not
  `settings.mion`; add the key to `LINT_SETTING_KEY_TABLE`). Default hides Info. The filter is a skip in the
  report loop of `packages/devtools/src/lint/index.ts`; the session cache keeps the full list.
- **Build:** Info prints nothing by default, no summary line: the level alone decides. A build option
  `levels` (next to `downgradeErrors`, also a tsconfig plugin key) set to `'all'` prints them. `mion compile`
  follows the same rule.
- **Why not do nothing:** the counts below are advice about working code, and they bury the real errors in the
  build log and the editor. Rule-level silencing cannot help (next bullet), and line comments do not scale.
- **Why not a build-only option:** it leaves the editor as noisy as before, and a second knob per host would drift
  from the lint one. One `levels` value read by every host covers both.
- **Why not per-rule `off` defaults:** five rules mix real problems with harmless notes (`redundant-marker`,
  `clone-shared-reference`, `pure-functions`, `enrichment-field`, `enrichment-message`), so only a level can
  split them.

**Codes that move to Info (38):**

- Skipped members, all families: VL/PJ/PJS/RJ 010 to 015 and VE 010 to 013 and 015 (function property, method, static, symbol key,
  non-data union arm, non-data value). A `Promise` property is treated like any other non-data property: Info.
- Validators on a written `any` / `unknown`: VL021, VE020.
- Clone skips: RUK011 (method), RUK012 (static).
- Advice: MKR006, OVR010, MET004, DWN004, FT008.
- The planned drizzle route rule starts as Info.

**Stay Warning:** enrichment todos FT/MD 020 and 023 (noisy, but the production build halts on them), orphan
carcasses FT/MD 021 and 022, UPN001, MRT005, RUK010, RUK015, MKR001, MET006, NE001, EXP001 to 003, DWN001 to
003, FT002, MD001, FT003, FT005 to 007, FT009, GE001, PFE9017.

**Counts that back it** (every lint-gated file in the repo, no lint config, 1365 findings): FT023 679, MD023
141, RJ011 54, PJS011 47, VE020 31, VL021 30, VL011 22, plus 224 downgraded RuntimeErrors in run-types tests.
Framework sources, the bench app and both drizzle e2e trees report zero. No silencing comment in the repo targets
a Warning code; all 216 target RuntimeErrors. The volume grows in real apps because one dropped member repeats
per call site and per function family.

**Places that treat any non-Warning level as an error**, all to fix with the new level:

- `severityOf`, `ts-go-runtypes/internal/diagnostics/catalog.go` (wire Severity Info already exists, unused).
- `ruleNameFor`, `packages/devtools/src/lint/diagnosticRouting.ts` (sends non-Warning to the error rule).
- `malformedCode`, `ts-go-runtypes/internal/diagnostics/expecterror.go` (DWN004 checks `LevelWarning` only).
- `surfaceDiagnostics` and `enrichDriftGate`, `packages/devtools/src/core/unplugin.ts`; the `runCompile` print
  loop, `ts-go-runtypes/cmd/mion/main.go`.
- Codegen `scripts/core/gen-diagnostics-catalog.mjs` (hard-coded level union), the website
  `DiagnosticCatalog.vue` / `DiagnosticLevels.vue` components, `catalog_test.go` level tests.

**Related problems found, fixed in this same PR (each with its own commit and test):**

1. Downgraded RuntimeErrors are reported by the lint at their `error` rule while the build prints them as
   warnings; the lint must honour `downgraded` the way the build does.
2. The per-walk latch (`walker.go`, `diagSeen[code]`) reports only the first dropped member of each code per
   type: a class with `a()` and `b()` warns about `a` only.
3. VL013, VE013, PJ013, PJS013, RJ013 are registered but never emitted (`SlotSymbolKeyedDropped`): emit or delete.
4. Stale rule text in `diagnosticRouting.ts`: the `redundant-marker` description names a ValidateOptions finding
   no code backs, the BAT comment says BAT008/BAT009 are redundant-marker (they are RuntimeError, routed to
   `invalid-marker`), the `enrichment-field` description claims FT006; MET has no `PREFIX_TO_FAMILY` row.
5. The linter page says "27 `runtypes/*` rules"; there are 24.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md`: existing sections "Picking Rules" and
"Recommended Config"; a new section for the Info level and the levels setting if it is picked; the
build-side knob on the devtools options page if the build gets one. If the answer is "do nothing",
only a tip in "Picking Rules" on turning noisy rules off.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A short written comparison of the options, with the warning counts that back it, and the one
  picked.
- If a change is picked: it is built and tested on both the lint and build side, and a finding can be
  quiet by default (the dropped-member warnings and the drizzle route rule are the first users).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (approved 2026-09-27)

## 1. Go: the Info level (commit `feat(diagnostics): add the Info level`)

- `ts-go-runtypes/internal/diagnostics/catalog.go`: `LevelInfo Level = 4`; `severityOf` maps Warning →
  SeverityWarning, Info → SeverityInfo (already on the wire), rest → Error; `LevelLabel` → `"info"`;
  `register` panic text; header comment.
- `expecterror.go` `malformedCode`: DWN004 ("already a warning") covers Info too; `Downgradeable` stays
  RuntimeError only; `Suppressible` already admits Info. DWN004 message wording covers "warning or info".
- Move the 38 codes to `LevelInfo`: split the member-drop loop in `codes_runtype.go` (VL/PJ/PJS/RJ
  010-015, VE 010-013 and 015, RUK011/RUK012 → Info; RUK010/RUK015 stay Warning), VL021/VE020, MKR006 (`codes_marker.go`),
  OVR010 (`codes_override.go`), MET004 (`codes_apimeta.go`), DWN004, FT008 (`codes_friendly.go`).
- `mion compile` (`cmd/mion/main.go` runCompile) and `mion enrich --no-emit`: skip Info unless the
  tsconfig plugin key `levels` is `"all"` (new key in `cmd/mion/config.go`, parsed like `downgradeErrors`).
  Echo it on `generate` next to `downgradeErrors` (`protocol.go` Response) so the JS build reads it too.
- Tests: `catalog_test.go` (four levels, `TestLevelsThatMoved` rows for every moved code, `TestLevelLabel`),
  `expecterror` DWN004 on an Info code, and the Go resolver tests asserting `SeverityWarning` on the moved
  codes (`diagnostics_test.go`, `*_dataonly_test.go`, …) now assert `SeverityInfo`. A `mion compile` test:
  Info hidden by default, printed with `levels: "all"`.

## 2. Codegen + wire TS

- `scripts/core/gen-diagnostics-catalog.mjs`: level union gains `'info'`; regenerate
  `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts` and the website
  `diagnostics-catalog.json` (`pnpm miondevx core codegen diag`).
- `packages/devtools/src/core/protocol.ts`: `Level.Info = 4`.

## 3. Lint (commit `feat(lint): hide Info findings unless levels is 'all'`)

- `session-protocol.ts`: `levels?: 'all'` in `LintSessionOptions` + `LINT_SETTING_KEY_TABLE`; any other
  value warns once like an unknown key (JS side only, not sent to the worker; the session cache keeps the
  full list).
- `index.ts` report loop: skip `diagnostic.level === Level.Info` unless `options.levels === 'all'`.
- `diagnosticRouting.ts` `ruleNameFor`: Info (and Warning) take the family's `warn` rule; Info never
  lands on an error rule. `validate-skipped-member`, `json-skipped-member`, `override-side-effect` now
  carry only Info codes, so they report nothing by default but stay in `recommended` (turning
  `levels: 'all'` on shows them at `warn`).
- Tests: `routing.test.ts` (Info routes to a warn rule, never an error rule), `plugin.test.ts` +
  `e2e-lint-settings.test.ts` (new key), `oxlint-e2e.test.ts` (VL011 hidden by default, shown with
  `settings.runtypes.levels: 'all'`, both through the shipped preset).

## 4. Build (commit `feat(devtools): hide Info findings in the build unless levels is 'all'`)

- `packages/devtools/src/core/unplugin.ts`: new `levels?: 'all'` plugin option (in `PLUGIN_OPTION_KEY_TABLE`,
  `plugin-option-keys.ts`, the tsconfig key parity list); plugin option wins over the tsconfig echo, same
  precedence as `downgradeErrors`. `surfaceDiagnostics` skips Info unless shown; Info never counts toward
  a halt. `enrichDriftGate` skips Info the same way and never halts on it. Covers every adapter and the
  Next broker (they all print through `surfaceDiagnostics`).
- `src/options.ts`: `levels` passes through `toRunTypesOptions` for `mionVitePlugin` / `withMion`.
- Tests: `downgrade-errors.test.ts` VL010/VL011 case → Info hidden, and printed as `info` with
  `levels: 'all'`; `runtype-diagnostics.test.ts` + `cache-disk.test.ts` severities; `plugin-option-parity`.
  Fuzz harnesses filtering `Severity.Warning` (`roundtripHarness.ts`, `typeFuzzHarness.ts`) also accept Info.

## 5. Related fixes, each its own commit + test

1. **Latch** (`walker.go` `diagSeen`): key on code + args, so every dropped member is reported, not only the
   first per code per type. Test: a class with `a()` and `b()` reports both.
2. **Symbol-keyed properties are compiled, not dropped (real bug), and VL/VE/PJ/PJS/RJ 013 never fire.**
   Today `{name: string; [k]: string}` compiles `[k]` as a string property named `"\xFE@k"`, so a required
   symbol member fails validation on a real object and JSON reads `undefined`; `DataOnly` drops symbol keys.
   Fix in `strippedPropertyDrop` (`union_strip.go`): a symbol-keyed name drops the member and emits
   `SlotSymbolKeyedDropped` (so the …013 codes fire, as Info), one spot for all five families. Move the
   `\xFE@` / `@@` check (twins in `convert/print.go` `isSymbolKeyedName`, `schemadoc/render.go`) into one
   `reflection` helper. Fix the stale comment at `reflection/runtype.go:91`. Tests: typefunctions test
   expecting VL013/PJ013 and the member missing from output; a run-types suite case validating and
   round-tripping an object with a symbol-keyed member.
3. **Downgraded findings in lint** (user picked): a new rule `runtypes/downgraded-error`, default `warn`,
   in `RULE_SPECS`, `recommended` and `oxlint-recommended.json`. `ruleNameFor` sends any finding with
   `downgraded: true` there; its message keeps the code plus `(downgraded)`, like the build line. Tests:
   `routing.test.ts` + an oxlint e2e case (a `@mion-downgrade-error` line reports under the new rule at warn).
   Linter page: a row in the rule table.
4. **Stale text** in `diagnosticRouting.ts`: `redundant-marker` description, the BAT comment, the
   `enrichment-field` FT006 claim; add a `MET` row to `PREFIX_TO_FAMILY` (routing test pins it).
5. **Linter page** "27 `runtypes/*` rules" → 24.

## 6. Docs

- `container/website/content/01.rpc/06.devtools/01.linter.md`: new section "Showing Info Findings"
  (the setting), a tip in "Picking Rules" on turning a rule off, the count fix, the rule table notes.
- `container/website/content/02.runtypes/08.diagnostics/01.error-levels.md` + `DiagnosticLevels.vue`
  (fourth card) + `DiagnosticCatalog.vue` (Info filter + badge class).
- `01.rpc/06.devtools/02.vite.md` and `02.runtypes/01.introduction/04.configuration.md`: the `levels` option row.
- `packages/devtools/src/lint/CLAUDE.md` "Severity" section: four levels, Info for lint-only advice.
- Update the drizzle route rule's todo: unblocked, its code is `LevelInfo`.

## 7. Finish

- `pnpm run check:builds`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm test`
  (or `pnpm run test:ci`), `pnpm run lint`, `pnpm run format`, `pnpm exec vitest run website-links`.
- Reconcile the spec, append the approved plan, `git mv` it to `docs/done/`.
- `docs-simplifier` and `comments-simplifier` subagents in parallel, each committed on its own.
- Fuzzing: not a candidate (no cheap oracle: this is routing and printing, not a value transform).
- Push to `claude/gracious-keller-sqkdgj`; PR only if asked. Labels when opened: `website`,
  `pre-publish-e2e` (new plugin option).


## What shipped

The picked option, built on the lint side, the build side and the CLI:

- **`LevelInfo`** (Go catalog, wire `Level.Info = 4`, `SeverityInfo`). 39 codes: the 38 listed above plus the new
  RUK013 (a symbol key the key-cleaning clone leaves out).
- **Lint:** `settings.runtypes.levels: 'all'` shows Info; any other value warns once. Info and Warning route to a
  family's `warn` rule. A finding a `@mion-downgrade-error` comment lowered reports under the new
  `runtypes/downgraded-error` rule (`warn`), message ending `(downgraded)`.
- **Build:** plugin option and tsconfig key `levels: 'all'` (echoed on `generate` like `downgradeErrors`, the option
  wins). No summary line: Info prints nothing by default. The enrichment drift gate needed no change: it only
  receives the FT/MD 020 to 023 hygiene codes, none of them Info.
- **Lint and the tsconfig key:** the tsconfig `levels` reaches the linter too. `serve --sources ops` (the linter's
  checker) reads that one plugin key and echoes it on `scanFiles`; the lint setting wins.
- **CLI:** `mion compile` hides Info unless the tsconfig sets `levels: "all"`. `mion enrich --no-emit` never fails on
  Info; its text report hides it unless the tsconfig sets `levels: "all"` (a bad value is fatal, as in `compile`),
  and `--json` keeps it.
- **Tests on real linters:** oxlint (the shipped preset, with and without `levels: 'all'`, and the downgraded
  finding at `warning`) and a new ESLint run through `configs.recommended` from the built plugin; a real
  `mion compile` run; build-plugin runs for the option and the tsconfig echo.

Related fixes, each its own commit and test:

1. Every dropped member is reported: the walker latch keys on code and args.
2. Symbol-keyed members were compiled as a string key named by tsgo's internal `\xFE@` spelling (a valid object
   failed validation, the clone added a bogus key). Every family now drops them with the …013 Info; one
   `reflection.IsSymbolKeyedName` helper replaces the two copies in `convert` and `schemadoc`.
3. The resolver crashed on a computed key (`[tag]: 'x'`) in an object a marker argument resolves to, and on a
   `@nonEnumerable` computed member.
4. FT008 is reported at its catalog level by the enrichment checker.
5. Stale rule descriptions fixed; `BAT` routes only to `invalid-marker`; `MET` got its own routing row.
6. The linter page rule count (now 25 with `downgraded-error`).
7. `mion compile --no-emit` printed the diagnostic count as "checked N file(s)"; it now counts the files.
8. Symbol keys also reached the strict unknown-key check (a valid value failed) and the union flat layout (a
   decoded union got the `\xFE@` key), and a symbol-keyed method's …011 message showed that spelling.

RUK013's level (the clone really loses a declared member) moved to its own todo, with the rest of
`removeUnknownKeys`' handling of members it cannot copy.

Not built here: the drizzle route rule. Its todo is unblocked and now names `LevelInfo` as its level.
