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

- The per-marker `Module` field **already exists** (`marker.Spec.Module`, [marker.go:130](../../ts-go-runtypes/internal/compiler/marker/marker.go)) and `Options.Specs` is documented as "the only configuration surface" — but nothing ever populates it. Both entry points pass an empty `marker.Options{}` (`cmd/ts-runtypes/main.go:339`, `cmd/ts-runtypes-wasm/main.go:49`), so `WithDefaults` always installs `DefaultSpecs()` with `DefaultModule = "@ts-runtypes/core"`. Most of the plumbing is there; what's missing is config reaching it.
- The actual gate is `DeclaredInModule` (`marker.go:580`): the alias must sit inside `declare module "<name>"`, or in a file whose nearest `package.json` has that `"name"`.
- Three places bypass `Options` and reference `marker.DefaultModule` **directly**, so they'd silently keep the old behaviour if only the specs get wired: `internal/enrichment/astcheck/astcheck.go:155`, `internal/cachegen/runtype/dataonly.go:52` and `:106`.
- `Session.markerModule()` (`internal/compiler/resolver/resolver.go:584`) collapses the set to "the first spec's Module" and feeds it to `builders.IsBuilderLeafCall` / `IsRunType`. That helper doesn't survive a multi-package or check-disabled world as written.
- JS side has two hardcoded copies of the string: `packages/ts-runtypes-devtools/src/unplugin.ts:254` and `src/eslint/prefilter.ts:19`. Both are documented as _fallback_ text prefilters (the primary gate is the resolver's site-file set), so they may only matter for files created mid-session, but they need to follow whatever config lands.
- New config keys go on `tsRuntypesPlugin` in `cmd/ts-runtypes/config.go` (the `json:` tags are the recognised tsconfig keys) and must be regenerated into `packages/ts-runtypes-devtools/src/go-generated/tsconfig-plugin-keys.generated.ts` via `pnpm rtx core codegen` — a parity test pins the two.

Things worth settling early (not decided here):

- **A plain re-export probably already works.** `export type {InjectRunTypeId} from '@ts-runtypes/core'` keeps the symbol's declaration inside the marker package, so the gate should pass. Confirm this first: if it holds, the feature is specifically about a package **declaring its own** brand types, which narrows the scope a lot.
- **Turning the check off is a real footgun** and should read as one: without it, any local `type InjectRunTypeId<T> = …` starts triggering rewrites. Prefer an allowlist of package names as the primary answer and treat "off" as the escape hatch.
- **Today's failure mode is silent.** A name match with a wrong module just doesn't match, and the type argument quietly degrades to `unknown`. A diagnostic ("looks like a marker but is declared in `<pkg>`") would make this far less painful, with or without the config.
- Check whether a third-party marker package needs any runtime dependency at all. The injected import block points at the generated cache modules, not at `@ts-runtypes/core`, so type-only may genuinely be enough.

## Done when

A package other than `ts-runtypes` can declare the marker brands itself, name itself in the tsconfig plugin config, and get call sites rewritten exactly as if the markers came from `@ts-runtypes/core`; the package check can also be disabled outright; the default behaviour is unchanged when nothing is configured; and the hardcoded `DefaultModule` references outside `marker.Options` no longer disagree with the configured set.
