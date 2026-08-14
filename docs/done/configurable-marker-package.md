---
type: feature
spec: full-plan
status: done
created: 2026-08-11
---

# Configurable marker package (or no package check at all)

## Intent

The build only recognised a marker type (`InjectRunTypeId`, `InjectTypeFnArgs`, `CompTimeArgs`, `PureFunction`, …) when two things matched: the symbol name, **and** the package it was declared in, which was hardwired to `@ts-runtypes/core`. That second check forced any library that wanted to expose RunTypes-powered APIs to depend on `ts-runtypes` purely to get the marker types, even though the markers are type-only brands with no runtime behind them.

## What shipped

A `markers` config object, settable in every layer, plus the plumbing to make the accepted package set reach every gate.

**The gate.** `marker.Options` gained `Packages []string` and `SkipPackageCheck bool`, and one entry point — `Options.DeclaredInMarkerPackage(symbol)` — that every gate-side caller now goes through. `Options.PackageSet()` unions each spec's own `Module` with the configured extras (trimmed, de-duplicated). `DeclaredInAnyModule` resolves each declaration's own module ONCE and compares against the set, so accepting N packages costs one package.json walk per declaration rather than N.

**`Packages` is additive, never a replacement.** `@ts-runtypes/core` stays accepted whatever a project configures, so the knob can never silently take a working call site away. Pinned by `TestMarkerPackage_ConfiguringExtrasKeepsTheDefaultPackage`.

**Config, in all three layers the task asked for:**

- tsconfig: `markers: {packages, checkPackage}` on `tsRuntypesPlugin` (`cmd/ts-runtypes/config.go`), mirrored into `tsconfig-plugin-keys.generated.ts` by `pnpm rtx core codegen pluginkeys`.
- bundler plugin: `PluginOptions.markers` (+ `PLUGIN_OPTION_KEYS`), so the option-parity test sees it on both sides.
- daemon at startup: `--marker-packages <csv>` and `--no-marker-package-check`, forwarded by `buildResolverArgs`. These are `serve` FLAGS rather than wire fields on purpose — the protocol's rule is that session-constant config rides the argv the client replays on respawn, not the per-request envelope.

Flag/tsconfig merge follows the house precedence with one deliberate exception: `packages` is UNIONED across the flag and the tsconfig rather than one shadowing the other, because a host plugin naming its own marker package and a project naming another are both true at once. `checkPackage` is a plain override (flag wins).

**Gate-side call sites rewired** off the hardcoded default: `enrichment/astcheck`, `cachegen/runtype/dataonly` (via the cache's new `SetMarkerOptions`), `compiler/comptimeargs`, all four `compiler/builders` entry points (which now take `marker.Options` instead of a module string + FS), and the nine `internal/convert` sites. `Session.markerModule()` — which collapsed the whole set to "the first spec's Module" — is gone, replaced by the session's real options via the new `Session.MarkerOptions()` accessor.

**Emit-side left alone on purpose.** `convert/imports.go`'s five managed specifiers (`@ts-runtypes/core` + `/builders`, `/formats`, `/formats/temporal`, `/json-schema`) still derive from `marker.DefaultModule`: they name the package whose RUNTIME helpers the converted output imports, which must not follow a third party's marker package. This was the distinction the pre-implementation refresh of this doc called out.

**JS text pre-filters** now follow the config instead of hardcoding the package: `unplugin.ts` (per-instance probes, `null` = gate disabled = let every file through) and `eslint/prefilter.ts`. The lint plugin gained a `markers` lint setting for the same reason — the resolver reads the tsconfig itself, but the JS-side pre-filter decides whether a file is worth a round trip at all, so without it a project whose markers live in its own package would have those files skipped before the resolver ever saw them.

## Tests

- `internal/compiler/marker/marker_test.go` — `PackageSet` defaulting (including the zero-value Options, which must not degrade into "accept nothing"), additivity, trim/dedupe, `SkipPackageCheck`, empty-module-set rejection.
- `internal/compiler/resolver/markerpackage_test.go` — end to end over a real third-party package in the overlay: unconfigured, configured, gate disabled, additivity, and cross-form hash equivalence. Both `getRunTypeId` shapes throughout, per the marker test coverage rule.
- `cmd/ts-runtypes/buildconfig_test.go` — the union merge, split/trim/dedupe, and `checkPackage` precedence.
- `test/resolver-args.test.ts` — the two spawn flags reach the daemon argv.
- `test/eslint/prefilter.test.ts` — a configured package matches, additively; gate disabled lets everything through.

## Surprise worth recording

The unconfigured case does NOT behave symmetrically across the two call shapes, and the tests pin both:

- **static** `getRunTypeId<T>()` carries `T` only on the brand alias, so the rejected alias means the type argument is lost and `T` degrades to `unknown`. A site is still emitted, because the brand-PROPERTY fallback (`matchedByBrand`) matches on the phantom property name alone and has never been module-gated.
- **reflect** `getRunTypeId(value)` infers `T` from the argument and resolves correctly even unconfigured.

So the package gate's real bite is on the static form, and the silent `unknown` is exactly what naming the package fixes.

## The near-miss diagnostic (MKR012)

Shipped in the same change, because the silent `unknown` above is the failure this feature exists to prevent and leaving it unreported would have shipped the fix without the signal that you need it.

`marker.DetectNearMiss` reports a type whose alias NAME is a marker's but whose declaration failed the gate, and the scan raises **MKR012** (Warning) naming both the marker and the package that declared it, pointing at `markers.packages`. It is deliberately narrow:

- It only runs when an INJECTION marker resolved with a nil type argument — i.e. only the brand-property fallback matched — so it costs nothing on the hot path and cannot fire on an ordinary parameter.
- It never fires when `checkPackage: false` (nothing can be rejected), nor once the package is trusted, so the fix genuinely silences it.
- It never fires for a brand declared by the USING file's own package. That is a project's own same-named local type, which is exactly what the gate exists to keep inert, and warning on it every time would be noise.

Pinned by four tests: fires with the right args, and stays silent in each of the three cases above.

## Left open

`cmd/ts-runtypes-wasm` still constructs `marker.Options{}` — the playground has no tsconfig plugin block to read, so there is nothing to thread yet.
