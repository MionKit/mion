---
type: feature
spec: guidelines
status: ready
created: 2026-07-24
---

# Plugin-driven enrichment: auto-generate + keep enrichment mirrors in sync from the bundler plugin

## Intent

Today all enrichment (FriendlyText, MockData, i18n translation mirrors) is **CLI-driven**:
the developer runs `ts-runtypes gen ... --update` to scaffold and keep the committed mirror
files under `<genDir>/enriched/{friendly,mock,i18n/<locale>}` in sync as their types change.
The bundler plugin drives none of it — enrichment is dispatched as a separate `ts-runtypes`
subcommand (its own Program, `os.Exit`), and the build/generate lane never touches the
`enriched/` contents (they're consumed at runtime through ordinary committed imports).

We want the **bundler plugin to optionally drive that same scaffold + keep-in-sync pass**, so a
developer doesn't have to remember to run the CLI: as source types change during a dev/build,
the plugin regenerates and reconciles the enrichment mirrors, exactly like `gen --update` does.
This is *scaffold + sync only* — NOT translation. Filling in translated strings stays a
developer/skill-triggered step; the plugin only keeps the file structure current. The CLI verbs
remain the authoring path, unchanged.

Why it's cheap and safe: `gen --update` is deterministic, value-preserving (never clobbers
authored values), idempotent and convergence-proven (see `enrich-hmr-e2e.test.ts`), so driving
it from the plugin does not violate the "never call an LLM in a build" invariant. The plugin's
scan already knows the demanded named types + their source files, so it knows exactly what to
enrich with little new config.

## Direction

**All new config is UNPLUGIN-ONLY (`PluginOptions` in `packages/ts-runtypes-devtools/src/unplugin.ts`), NOT tsconfig.** This feature is a host/dev-loop behavior, so it does not go through the
tsconfig plugin entry or the option-parity guard's shared set. The CLI stays the authoritative
authoring path.

Decided config semantics (implementer finalizes the exact shape; a grouping under one `enrich`
object is suggested):

- **FriendlyText → a boolean flag** — enable auto gen+sync of the `enriched/friendly/` mirrors.
- **MockData → a boolean flag** — enable auto gen+sync of the `enriched/mock/` mirrors.
- **i18n → a config object** (`sourceLocale?`, `locales?`, `strict?` — same shape as the tsconfig
  `i18nPluginConfig` at `ts-go-runtypes/cmd/ts-runtypes/config.go`); **its presence is the enable
  flag** for scaffolding/syncing the per-locale `enriched/i18n/<locale>/` mirrors.
- **An HMR-suppression flag** — when set, the unplugin ignores HMR / triggers no reload for
  changes under `<genDir>/enriched/**` (these are write-only outputs). Make it a **toggle** so it
  can be turned off to experiment/debug "in case HMR is causing issues in those dirs." Note this
  flag is somewhat orthogonal to the auto-gen flags: it's about how the dev watcher treats the
  write-only enrich folder, and is useful even when the enriched files are edited by hand or by
  the CLI while the dev server runs.
- **Default OFF for everything** — existing builds/dev servers must be unchanged unless opted in.

Verified pointers (from a 2026-07-24 investigation — the implementer should still re-confirm):

- **Mechanism to reuse: child-process, zero Go/protocol change.** The plugin spawns the existing
  CLI, e.g. `ts-runtypes gen <file> <Type> --friendly --mock --update --gen-dir <genDir>` (and the
  i18n scaffold pass for each configured locale). This is the exact path `enrich-hmr-e2e.test.ts`
  already drives via `spawnSync(BIN, ['gen', ..., '--update', '--gen-dir', ...])`. A warm resolver
  protocol-op is a possible later optimization but is a much larger cross-language change (the
  resolver would have to build the enrichment Program and write committed files) — start with the
  child process.
- CLI surface to call: `ts-runtypes gen` flags are `--mock`, `--friendly`, `--update`, `--prune`,
  `--gen-dir`, `--translate` (`ts-go-runtypes/cmd/ts-runtypes/enrich_cli.go`). `--update` is the
  value-preserving reconcile; `--prune` is destructive (keep manual, never auto-run); a plain
  `gen` scaffolds; `check` is read-only.
- Enrichment ↔ build boundary to respect: enrichment is a separate argv dispatch
  (`cmd/ts-runtypes/main.go`, before flag parsing), its own inferred Program; the generate lane
  never reads `enriched/` contents (`internal/compiler/resolver/generate.go`). Keep the driver
  deterministic (scaffold + reconcile only).
- Discovery: the plugin's scan response already carries the demanded named types + source files
  (`Response.RunTypes[].typeName`, `SiteFiles`) and the resolved `genDir` (`gen.outDir`), so it can
  target the right `(file, Type)` pairs.
- HMR hook: the unplugin implements `vite.handleHotUpdate` (and could add `watchChange`) in
  `unplugin.ts`. The suppression should short-circuit any change resolving under
  `<genDir>/enriched/**` (`gen.outDir` + `/enriched`).

Left for the implementer to plan with fresh context (the reason this is `guidelines`):

- **When it runs** — dev/watch sync vs also on a production `vite build`. Recommendation: sync in
  dev/watch, and on a full build either do nothing or a read-only `check` (mutating committed
  source mid-build breaks build reproducibility). Confirm with the owner.
- Debounce / batching of `gen --update` across rapid edits; whether one pass covers all enabled
  families per changed file.
- The exact `PluginOptions` shape (grouped `enrich` object vs top-level flags) and how the
  HMR-suppress flag relates to the auto-gen flags.
- Parity-guard bookkeeping: add the new unplugin-only keys to `JS_ONLY` in
  `packages/ts-runtypes-devtools/test/plugin-option-parity.test.ts` (they intentionally have no
  tsconfig counterpart). Reconsider whether the plugin's `i18n` object should share the tsconfig
  `i18n` — they may share a shape but drive different lanes (plugin enrichment vs the CLI).

## Done when

- With the options enabled on the bundler plugin, editing a source type during dev/watch scaffolds
  and keeps in sync the corresponding `enriched/{friendly,mock,i18n/<locale>}` mirror files,
  matching what `ts-runtypes gen --update` produces (value-preserving; NO translation content).
- Each family toggles independently: FriendlyText flag, MockData flag, i18n object presence.
  Everything defaults OFF; a plugin with none of these set behaves exactly as today.
- When the HMR-suppression flag is set, writing/regenerating (or hand-editing) files under
  `<genDir>/enriched/**` triggers NO HMR/reload; toggling it off restores normal behavior.
- The CLI verbs (`gen`/`check`/`--translate`) are unchanged and remain the authoring path.
- Tests: a plugin-driven analog of `enrich-hmr-e2e.test.ts` (drive through the plugin hook; assert
  the mirrors sync AND that touching the enrich folder does not trigger HMR).
- Docs updated: the "enrichment is CLI-only / never in a build" invariant text in
  `docs/AI_ENRICHMENT.md` and `container/website/content/3.ai-integration/1.workflow-and-commands.md`
  reflect the new opt-in plugin-driven sync; the new options are documented on the config page as
  bundler-plugin-only.

## Relationship

This is the deferred half of `docs/done/option-parity-tsconfig-plugin.md` (the option-parity
work shipped without `i18n` plugin parity; `i18n` is folded into this feature instead, because it
is meaningful on the plugin only once the plugin drives enrichment).
