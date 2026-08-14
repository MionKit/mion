package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The configurable marker package: a library that declares the marker brands
// ITSELF (rather than importing them from ts-runtypes) is recognised once the
// project names its package, and not before. Per the marker test coverage rule
// every case is written twice — static `getRunTypeId<T>()` and reflection
// `getRunTypeId(value)` — with a hash-equivalence assertion at the end.

// thirdPartyMarkers declares the brands + the two entry points under a package
// name that is NOT ts-runtypes. Byte-identical to what the real package
// declares, so the ONLY thing standing between it and recognition is the
// module-of-origin gate.
const thirdPartyMarkers = `
export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
export declare function getRunTypeId<T>(val?: T, id?: InjectRunTypeId<T>): string;
`

const thirdPartyPackageName = "@my-org/runtypes-markers"

// markerPackageProgram builds a program whose only marker declarations come
// from thirdPartyPackageName, scans callCode, and returns the resolved RunType
// for the single call site (nil when the markers went unrecognised).
func markerPackageProgram(t *testing.T, callCode string, markerOpts marker.Options) *reflection.RunType {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	pkgDir := "node_modules/" + thirdPartyPackageName
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"):        ``, // suppress the fake ambient
		tspath.ResolvePath(cwd, pkgDir+"/package.json"): `{"name":"` + thirdPartyPackageName + `","exports":{".":"./index.d.ts"}}`,
		tspath.ResolvePath(cwd, pkgDir+"/index.d.ts"):   thirdPartyMarkers,
		tspath.ResolvePath(cwd, "call.ts"):              callCode,
	}
	fileNames := make([]string, 0, len(overlay))
	for path := range overlay {
		fileNames = append(fileNames, path)
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, fileNames)
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	session, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true, Marker: markerOpts})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(session.Close)

	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scan error: %s", resp.Error)
	}
	if len(resp.Sites) == 0 {
		return nil
	}
	for i := range resp.RunTypes {
		if resp.RunTypes[i].ID == resp.Sites[0].ID {
			return resp.RunTypes[i]
		}
	}
	return nil
}

const staticCall = `import {getRunTypeId} from '@my-org/runtypes-markers';
getRunTypeId<string>();
`

const reflectCall = `import {getRunTypeId} from '@my-org/runtypes-markers';
const value: string = 'hello';
getRunTypeId(value);
`

// --- default: a foreign marker package is NOT trusted -----------------------
//
// These two pin the failure mode the configuration exists to fix, and they are
// deliberately NOT symmetric — the package gate bites the two call shapes
// differently:
//
//   - STATIC `getRunTypeId<T>()` carries T ONLY on the brand alias. The gate
//     rejects the foreign alias, so the type argument is lost and T degrades
//     to `unknown`. A site is still emitted, because the brand-PROPERTY
//     fallback (matchedByBrand) matches on the phantom property name alone and
//     has never been module-gated. Silently reflecting `unknown` instead of the
//     user's type is exactly what naming the package fixes.
//   - REFLECT `getRunTypeId(value)` infers T from the ARGUMENT, so it resolves
//     correctly even unconfigured. Configuring the package is not what makes
//     this shape work — which is precisely why the static counterpart below
//     must be tested separately rather than assumed to behave the same.

func TestMarkerPackage_UnconfiguredLosesTheTypeArgument_Static(t *testing.T) {
	got := markerPackageProgram(t, staticCall, marker.Options{})
	if got == nil {
		t.Fatal("expected the brand-property fallback to still emit a site")
	}
	if got.Kind != reflection.KindUnknown {
		t.Fatalf("expected KindUnknown (type argument lost to the package gate), got %d", got.Kind)
	}
}

func TestMarkerPackage_UnconfiguredStillInfersFromTheValue_Reflect(t *testing.T) {
	got := markerPackageProgram(t, reflectCall, marker.Options{})
	if got == nil {
		t.Fatal("expected the brand-property fallback to still emit a site")
	}
	if got.Kind != reflection.KindString {
		t.Fatalf("expected KindString (T inferred from the argument, not the alias), got %d", got.Kind)
	}
}

// --- configured: the project names the package ------------------------------

func TestMarkerPackage_ConfiguredIsRecognised_Static(t *testing.T) {
	got := markerPackageProgram(t, staticCall, marker.Options{Packages: []string{thirdPartyPackageName}})
	if got == nil {
		t.Fatal("expected the configured marker package to be recognised, got no site")
	}
	if got.Kind != reflection.KindString {
		t.Fatalf("expected KindString, got %d", got.Kind)
	}
}

func TestMarkerPackage_ConfiguredIsRecognised_Reflect(t *testing.T) {
	got := markerPackageProgram(t, reflectCall, marker.Options{Packages: []string{thirdPartyPackageName}})
	if got == nil {
		t.Fatal("expected the configured marker package to be recognised, got no site")
	}
	if got.Kind != reflection.KindString {
		t.Fatalf("expected KindString, got %d", got.Kind)
	}
}

// --- the escape hatch: no package check at all ------------------------------

func TestMarkerPackage_CheckDisabledAcceptsAnyPackage_Static(t *testing.T) {
	got := markerPackageProgram(t, staticCall, marker.Options{SkipPackageCheck: true})
	if got == nil {
		t.Fatal("expected SkipPackageCheck to accept markers from any package, got no site")
	}
	if got.Kind != reflection.KindString {
		t.Fatalf("expected KindString, got %d", got.Kind)
	}
}

func TestMarkerPackage_CheckDisabledAcceptsAnyPackage_Reflect(t *testing.T) {
	got := markerPackageProgram(t, reflectCall, marker.Options{SkipPackageCheck: true})
	if got == nil {
		t.Fatal("expected SkipPackageCheck to accept markers from any package, got no site")
	}
	if got.Kind != reflection.KindString {
		t.Fatalf("expected KindString, got %d", got.Kind)
	}
}

// --- the additive guarantee -------------------------------------------------

// Configuring a package must never REVOKE the built-in one: a project that
// names its own marker package keeps working with markers imported from
// ts-runtypes in the same build.
func TestMarkerPackage_ConfiguringExtrasKeepsTheDefaultPackage(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	session := setupInlineWith(t, map[string]string{"test.ts": code}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.Marker = marker.Options{Packages: []string{thirdPartyPackageName}}
	})
	runType := resolveFile(t, session, "test.ts")
	if runType.Kind != reflection.KindString {
		t.Fatalf("expected the default marker package to still resolve, got kind %d", runType.Kind)
	}
}

// --- cross-form hash equivalence (marker test coverage rule) ----------------

// Both call shapes must collapse to the SAME cache entry when T is equivalent,
// exactly as they do for the built-in package — the configured package changes
// who may declare the brand, never how the id is computed.
func TestMarkerPackage_FormEquivalence(t *testing.T) {
	markerOpts := marker.Options{Packages: []string{thirdPartyPackageName}}
	staticType := markerPackageProgram(t, staticCall, markerOpts)
	reflectType := markerPackageProgram(t, reflectCall, markerOpts)
	if staticType == nil || reflectType == nil {
		t.Fatal("expected both call shapes to resolve through the configured marker package")
	}
	if staticType.ID != reflectType.ID {
		t.Fatalf("static and reflect forms disagree: %q vs %q", staticType.ID, reflectType.ID)
	}
}
