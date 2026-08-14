---
type: feature
spec: guidelines
status: ready
created: 2026-08-14
---

# Diagnose a marker declared in an untrusted package

## Intent

Split out of [configurable-marker-package.md](../done/configurable-marker-package.md), which shipped the `markers` config but deliberately left the error reporting alone.

A type that is named exactly like a marker but declared in a package the project has not trusted is a NEAR MISS, and today it fails silently. The static form (`getRunTypeId<T>()`) loses its type argument and quietly reflects `unknown`; nothing tells the user that adding one line to `markers.packages` would fix it. That is the worst shape of failure: the build succeeds, the generated validator is for `unknown`, and the mistake surfaces much later as a validator that accepts everything.

## Direction

Emit a build diagnostic when a symbol matches a marker's NAME but fails the package gate, naming the package it was actually declared in and pointing at the `markers.packages` key. The implementer picks the severity (warning is probably right, since the build is not wrong, just useless) and the code, and decides how to keep it from firing on genuinely unrelated same-named local types.

Pointers, all verified while implementing the parent todo:

- The gate is `marker.Options.DeclaredInMarkerPackage` (`ts-go-runtypes/internal/compiler/marker/marker.go`). The near-miss is exactly "name matched in `aliasForSpec`, then this returned false" — that function is where the signal is cheapest to catch.
- `marker.DeclaringModuleOfNode` already resolves the module a declaration belongs to, so the "declared in `<pkg>`" half of the message needs no new machinery.
- The degradation is pinned by `TestMarkerPackage_UnconfiguredLosesTheTypeArgument_Static` (`internal/compiler/resolver/markerpackage_test.go`), which is the regression this diagnostic would sit on top of. Note the reflect form does NOT degrade (T comes from the argument), so a diagnostic that fires on both shapes needs care: on the reflect form nothing is actually broken.
- Beware the brand-PROPERTY fallback (`matchedByBrand`): it matches on the phantom property name alone and is deliberately not module-gated, so a near miss still produces a site. Any diagnostic has to fire from the alias path, not from "no site was produced".
- New codes live in `internal/diagnostics` and are mirrored into `packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts` by codegen; the lint plugin routes them by code prefix (`MKR…`).

## Done when

A marker-named type from an untrusted package produces a diagnostic that names the declaring package and the config key to add, instead of silently resolving to `unknown`; it does not fire for the configured or gate-disabled cases, nor for the reflect form where the type still resolves correctly.
