---
type: feature
spec: guidelines
status: ready
created: 2026-08-11
---

# Configurable marker package (or no package check at all)

## Intent

The build only recognises a marker type (`InjectRunTypeId`, `InjectTypeFnArgs`, `CompTimeArgs`, `PureFunction`, …) when two things match: the symbol name, **and** the package it was declared in, which is hardwired to `@ts-runtypes/core`. That second check forces any library that wants to expose RunTypes-powered APIs to depend on `ts-runtypes` purely to get the marker types, even though the markers are type-only brands with no runtime behind them.

We want a library to be able to declare its own copies of the brands (or point us at its own package name) and still have the build recognise them, plus an escape hatch to turn the package check off entirely.

## Direction

The rough shape: expose the marker package(s) as tsconfig plugin config, and allow disabling the module check. The implementer plans the details (key name, one package or a list, per-marker or global, what "disabled" means precisely).

Pointers verified while writing this:

- The per-marker `Module` field **already exists** (`marker.Spec.Module`, [marker.go:132](../../ts-go-runtypes/internal/compiler/marker/marker.go)) and `Options.Specs` is documented as "the only configuration surface" — but nothing ever populates it. Both entry points pass an empty `marker.Options{}` (`cmd/ts-runtypes/main.go:341`, `cmd/ts-runtypes-wasm/main.go:49`), so `WithDefaults` always installs `DefaultSpecs()` with `DefaultModule = "@ts-runtypes/core"`. Most of the plumbing is there; what's missing is config reaching it.
- The actual gate is `DeclaredInModule` (`marker.go:580`): the alias must sit inside `declare module "<name>"`, or in a file whose nearest `package.json` has that `"name"`.
- **Two different things are spelled `@ts-runtypes/core` today, and this feature must split them apart.** One is _where the marker brands are declared_ (the gate this todo is about, which a third party should be able to own). The other is _the runtime package whose helpers we import into generated / rewritten code_, which must keep pointing at the real `ts-runtypes` regardless of who declared the markers. Any implementation that swaps `DefaultModule` wholesale will break the second one. Audit each reference and decide which of the two it is.
- Places that bypass `Options` and reference `marker.DefaultModule` **directly**, so they'd silently keep the old behaviour if only the specs get wired:
  - Gate-side (should follow the configured marker package): `internal/enrichment/astcheck/astcheck.go:155`, `internal/cachegen/runtype/dataonly.go:52` and `:106`, and the `builders.IsRunType` / `IsBuilderLeafCall` calls in `internal/convert/callsites.go:189,291,397` and `internal/convert/recognize.go:136,176,266`.
  - Emit-side (should almost certainly stay pinned to the runtime package): `internal/convert/imports.go:20-24`, which derives the five managed import specifiers it writes into user files (`@ts-runtypes/core`, plus `/builders`, `/formats`, `/formats/temporal`, `/json-schema`).
- `Session.markerModule()` (`internal/compiler/resolver/resolver.go:584`) collapses the set to "the first spec's Module" and feeds it to `builders.IsBuilderLeafCall` / `IsRunType`. That helper doesn't survive a multi-package or check-disabled world as written.
- JS side has two hardcoded copies of the string: `packages/ts-runtypes-devtools/src/unplugin.ts:254` and `src/eslint/prefilter.ts:19`. Both are documented as _fallback_ text prefilters (the primary gate is the resolver's site-file set), so they may only matter for files created mid-session, but they need to follow whatever config lands.
- New config keys go on `tsRuntypesPlugin` in `cmd/ts-runtypes/config.go` (the `json:` tags are the recognised tsconfig keys) and must be regenerated into `packages/ts-runtypes-devtools/src/go-generated/tsconfig-plugin-keys.generated.ts` via `pnpm rtx core codegen` — a parity test pins the two. `convertDialect` (`config.go:126`) is a recent example of the whole add-a-key round trip to copy.

Things worth settling early (not decided here):

- **A plain re-export probably already works.** `export type {InjectRunTypeId} from '@ts-runtypes/core'` keeps the symbol's declaration inside the marker package, so the gate should pass. Confirm this first: if it holds, the feature is specifically about a package **declaring its own** brand types, which narrows the scope a lot.
- **Turning the check off is a real footgun** and should read as one: without it, any local `type InjectRunTypeId<T> = …` starts triggering rewrites. Prefer an allowlist of package names as the primary answer and treat "off" as the escape hatch.
- **Today's failure mode is silent.** A name match with a wrong module just doesn't match, and the type argument quietly degrades to `unknown`. A diagnostic ("looks like a marker but is declared in `<pkg>`") would make this far less painful, with or without the config.
- Check whether a third-party marker package needs any runtime dependency at all. The resolver's injected import block points at the generated cache modules, not at `@ts-runtypes/core`, so the marker half may genuinely be type-only. Note this is **not** true of the `convert` lane, whose output imports real runtime helpers from `@ts-runtypes/core` and its subpaths, so a converted file in a third-party-marker project still depends on the runtime package.

## Done when

A package other than `ts-runtypes` can declare the marker brands itself, name itself in the tsconfig plugin config, and get call sites rewritten exactly as if the markers came from `@ts-runtypes/core`; the package check can also be disabled outright; the default behaviour is unchanged when nothing is configured; and every gate-side `DefaultModule` reference outside `marker.Options` follows the configured set, while the emit-side ones stay pinned to the runtime package on purpose (with a comment saying so, so the next reader doesn't "fix" them).
