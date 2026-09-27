---
type: feature
spec: guidelines
status: ready
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
- **Why not per-rule `off` defaults:** five rules mix real problems with harmless notes (`redundant-marker`,
  `clone-shared-reference`, `pure-functions`, `enrichment-field`, `enrichment-message`), so only a level can
  split them.

**Codes that move to Info (38):**

- Skipped members, all families: VL/VE/PJ/PJS/RJ 010 to 015 (function property, method, static, symbol key,
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
