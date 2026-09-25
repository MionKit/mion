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
- **No rule starts off.** `RuleSpec.default` is only `'error' | 'warn'` (15 and 14 rules today), and
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
