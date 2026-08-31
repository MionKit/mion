package typeid_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The test overlay extends the standard runtypes.d.ts with a TypeFormat
// alias that lowers to a base-and-brand intersection. tsgo widens it the
// same way the production ts-runtypes/formats type will — two
// sentinel properties carrying the format name and the literal params —
// so the scanner exercises the real detection path, not a parallel one.
const runtypesWithFormatsDTS = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function getRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type TypeFormat<Base, Name extends string, Params, BrandName extends string = never> = Base & {
    readonly __rtFormatName?: Name;
    readonly __rtFormatParams?: Params;
  } & ([BrandName] extends [never] ? unknown : {readonly __rtFormatBrand: BrandName});
}
`

// runtypesWithSymbolFormatsDTS is the SHIPPED spelling of the same alias: the
// sentinels ride `unique symbol` keys (src/runtypes/sentinelKeys.ts) so that
// branding a type leaves the STRING keys of the shape it brands untouched.
// tsgo names such a property InternalSymbolNamePrefix + "@" + the DECLARATION's
// name + "@" + a per-program id, which is what isSentinelProp matches.
const runtypesWithSymbolFormatsDTS = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function getRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export const __rtFormatName: unique symbol;
  export const __rtFormatParams: unique symbol;
  export type TypeFormat<Base, Name extends string, Params, BrandName extends string = never> = Base & {
    readonly [__rtFormatName]?: Name;
    readonly [__rtFormatParams]?: Params;
  };
}
`

// runFormatScan builds an in-memory program with the format-aware .d.ts
// overlay, scans the supplied code, and returns the root call site's
// RunType. Sibling of rootFor in structural_test.go — kept separate so
// the format-specific .d.ts doesn't leak into the shared overlay.
func runFormatScan(t *testing.T, code string) *reflection.RunType {
	t.Helper()
	return runFormatScanWithDTS(t, runtypesWithFormatsDTS, code)
}

// runFormatScanWithDTS is runFormatScan over a caller-supplied marker .d.ts, so
// the string-keyed and symbol-keyed spellings of the sentinels can be scanned
// through the identical pipeline and compared.
func runFormatScanWithDTS(t *testing.T, markerDTS, code string) *reflection.RunType {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	dtsPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	testPath := tspath.ResolvePath(cwd, "test.ts")
	overlay := map[string]string{
		dtsPath:  markerDTS,
		testPath: code,
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, []string{dtsPath, testPath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)
	scanResp := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if scanResp.Error != "" {
		t.Fatalf("scanFiles: %s", scanResp.Error)
	}
	if len(scanResp.Sites) == 0 {
		t.Fatalf("scanFiles returned no sites")
	}
	dump := res.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, node := range dump {
		if node.ID == scanResp.Sites[0].ID {
			return node
		}
	}
	t.Fatalf("root id %q not in dump", scanResp.Sites[0].ID)
	return nil
}

func TestFormatAnnotation_PopulatedOnBrandedString(t *testing.T) {
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FixtureFormat = TypeFormat<string, 'fixture', {tag: 1}>;
getRunTypeId<FixtureFormat>();
`)
	if root.Kind != reflection.KindString {
		t.Fatalf("expected branded primitive to surface as KindString, got %v", root.Kind)
	}
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation to be populated, got nil")
	}
	if root.FormatAnnotation.Name != "fixture" {
		t.Fatalf("expected format name %q, got %q", "fixture", root.FormatAnnotation.Name)
	}
	if got, ok := root.FormatAnnotation.Params["tag"]; !ok || got != float64(1) {
		t.Fatalf("expected params.tag == 1, got %v (ok=%v)", got, ok)
	}
	if len(root.TypeMeta) != 0 {
		t.Fatalf("format brand must NOT appear in TypeMeta, got %d entries", len(root.TypeMeta))
	}
}

func TestFormatAnnotation_Idempotency_SameParamsSameID(t *testing.T) {
	rootA := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FmtA = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<FmtA>();
`)
	rootB := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FmtB = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<FmtB>();
`)
	if rootA.ID != rootB.ID {
		t.Fatalf("expected identical FormatAnnotation params to produce identical ids; got %q vs %q", rootA.ID, rootB.ID)
	}
}

func TestFormatAnnotation_DistinctParamsDistinctID(t *testing.T) {
	root10 := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type Fmt10 = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Fmt10>();
`)
	root20 := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type Fmt20 = TypeFormat<string, 'fixture', {maxLength: 20}>;
getRunTypeId<Fmt20>();
`)
	if root10.ID == root20.ID {
		t.Fatalf("expected distinct params to produce distinct ids; both got %q", root10.ID)
	}
}

func TestFormatAnnotation_KeyOrderIndependent(t *testing.T) {
	rootAB := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FmtAB = TypeFormat<string, 'fixture', {a: 1, b: 2}>;
getRunTypeId<FmtAB>();
`)
	rootBA := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FmtBA = TypeFormat<string, 'fixture', {b: 2, a: 1}>;
getRunTypeId<FmtBA>();
`)
	if rootAB.ID != rootBA.ID {
		t.Fatalf("expected key-order independence; got %q vs %q", rootAB.ID, rootBA.ID)
	}
}

func TestFormatAnnotation_BareKindDistinctFromBrand(t *testing.T) {
	rootBare := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
`)
	rootBranded := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type Branded = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Branded>();
`)
	if rootBare.ID == rootBranded.ID {
		t.Fatalf("expected plain `string` and a TypeFormat-branded variant to differ; both got %q", rootBare.ID)
	}
	if rootBranded.FormatAnnotation == nil {
		t.Fatalf("branded variant must carry FormatAnnotation")
	}
	if rootBare.FormatAnnotation != nil {
		t.Fatalf("plain string must NOT carry FormatAnnotation, got %+v", rootBare.FormatAnnotation)
	}
}

// TestFormatAnnotation_BrandNameIsIdNeutral pins that the optional TypeFormat
// `BrandName` is a PURE TS-level discriminator: a branded format and its
// unbranded twin resolve ONE structural id, the brand never lands in TypeMeta,
// and the FormatAnnotation is identical. The brand NAME itself is irrelevant to
// the id. Guards the IsFormatBrandMember skip in both intersection-collapse passes
// — without it the `{__rtFormatBrand}` member fragments the id (a branded format
// would stop deduping with its unbranded twin, and every predefined `Format*`
// whose alias carries a brand name would shift id).
func TestFormatAnnotation_BrandNameIsIdNeutral(t *testing.T) {
	unbranded := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type Plain = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Plain>();
`)
	branded := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type Branded = TypeFormat<string, 'fixture', {maxLength: 10}, 'MyBrand'>;
getRunTypeId<Branded>();
`)
	if branded.ID != unbranded.ID {
		t.Fatalf("BrandName must be id-neutral; branded %q != unbranded %q", branded.ID, unbranded.ID)
	}
	if len(branded.TypeMeta) != 0 {
		t.Fatalf("brand member must NOT appear in TypeMeta, got %d entries", len(branded.TypeMeta))
	}
	if branded.FormatAnnotation == nil || branded.FormatAnnotation.Name != "fixture" {
		t.Fatalf("branded format must carry the same FormatAnnotation (name=fixture), got %+v", branded.FormatAnnotation)
	}
	if got, ok := branded.FormatAnnotation.Params["maxLength"]; !ok || got != float64(10) {
		t.Fatalf("branded format params must match unbranded; got maxLength=%v ok=%v", got, ok)
	}
	// A DIFFERENT brand name is just as id-neutral — the name never enters the id.
	otherBrand := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type Other = TypeFormat<string, 'fixture', {maxLength: 10}, 'OtherBrand'>;
getRunTypeId<Other>();
`)
	if otherBrand.ID != unbranded.ID {
		t.Fatalf("a different BrandName must also be id-neutral; %q != %q", otherBrand.ID, unbranded.ID)
	}
}

func TestFormatAnnotation_StructuralKey_Canonicalises(t *testing.T) {
	a := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "fixture",
		Params: map[string]any{"a": 1.0, "b": 2.0},
	})
	b := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "fixture",
		Params: map[string]any{"b": 2.0, "a": 1.0},
	})
	if a != b {
		t.Fatalf("FormatAnnotationStructuralKey must be key-order-independent: %q vs %q", a, b)
	}
	if typeid.FormatAnnotationStructuralKey(nil) != "" {
		t.Fatalf("nil annotation must yield empty key")
	}
}

// TestFormatAnnotation_SamplesExcludedFromKey pins that mockSamples is NOT
// id-relevant (generation metadata, not validation behaviour) while `message`
// and a pattern's `source`/`flags` still are. Two same-shape formats differing
// only in samples MUST share one key (and dedup onto one cache entry).
func TestFormatAnnotation_SamplesExcludedFromKey(t *testing.T) {
	withSamples := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0, "mockSamples": []any{"a", "b"}},
	})
	bare := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0},
	})
	if withSamples != bare {
		t.Fatalf("mockSamples must NOT affect the key; %q != %q", withSamples, bare)
	}
	// Different declared pools still converge on the same key (the conflict is a
	// build diagnostic, not an id split).
	otherSamples := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0, "mockSamples": []any{"x", "y", "z"}},
	})
	if otherSamples != bare {
		t.Fatalf("a different sample pool must NOT change the key; %q != %q", otherSamples, bare)
	}
	// `message` DOES stay id-relevant (it changes the emitted error val).
	withMessage := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0, "message": "too long"},
	})
	if withMessage == bare {
		t.Fatalf("message must affect the key; both gave %q", bare)
	}
	// Samples are skipped at NESTED depth too (FormatPattern nests them in
	// `pattern`), but the pattern's source/flags stay.
	nested := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"pattern": map[string]any{"source": "^x$", "flags": "", "mockSamples": []any{"x"}}},
	})
	nestedNoSamples := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"pattern": map[string]any{"source": "^x$", "flags": ""}},
	})
	if nested != nestedNoSamples {
		t.Fatalf("nested mockSamples must NOT affect the key; %q != %q", nested, nestedNoSamples)
	}
	// A different pattern SOURCE still differentiates.
	nestedOtherSource := typeid.FormatAnnotationStructuralKey(&reflection.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"pattern": map[string]any{"source": "^y$", "flags": ""}},
	})
	if nestedOtherSource == nested {
		t.Fatalf("a different pattern source must still differ")
	}
	// Sanity: a real validation param (maxLength) still differentiates.
	if bare == nestedNoSamples {
		t.Fatalf("different validation params must still differ")
	}
}

// TestFormatAnnotation_SamplesSharedEndToEnd confirms sample id-irrelevance
// holds through the full scan → structural id (not just the key fn): formats
// differing ONLY in mockSamples intern as the SAME entry (samples describe the
// same validator). A different validation param still forks the id.
func TestFormatAnnotation_SamplesSharedEndToEnd(t *testing.T) {
	a := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type T = TypeFormat<string, 'stringFormat', {maxLength: 10; mockSamples: ['a', 'b']}>;
getRunTypeId<T>();
`)
	b := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type T = TypeFormat<string, 'stringFormat', {maxLength: 10; mockSamples: ['x', 'y', 'z']}>;
getRunTypeId<T>();
`)
	if a.ID != b.ID {
		t.Fatalf("formats differing only in mockSamples must share one id; %q != %q", a.ID, b.ID)
	}
	// A real validation param still differentiates.
	c := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type T = TypeFormat<string, 'stringFormat', {maxLength: 20; mockSamples: ['a', 'b']}>;
getRunTypeId<T>();
`)
	if c.ID == a.ID {
		t.Fatalf("a different maxLength must fork the id; both gave %q", a.ID)
	}
}

// TestSymbolKeyedSentinel_MatchesStringKeyed is the tripwire for the ONE
// compiler-internal detail this package depends on: how tsgo names a property
// whose key is a `unique symbol`. The shipped types brand with symbol keys so
// they stay out of a branded type's string keys, and the resolver recognises
// them by matching that name.
//
// If upstream ever changes the naming scheme, the failure mode without this
// test is SILENT and total: no sentinel is ever matched, every branded type
// degrades to its base, and ids shift wholesale with nothing red. So assert the
// end state directly — a symbol-keyed brand must be recognised, and must land
// on the SAME structural id as the string-keyed spelling of the same type,
// since the property name never reaches the hash.
func TestSymbolKeyedSentinel_MatchesStringKeyed(t *testing.T) {
	const code = `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FixtureFormat = TypeFormat<string, 'fixture', {tag: 1}>;
getRunTypeId<FixtureFormat>();
`
	stringKeyed := runFormatScanWithDTS(t, runtypesWithFormatsDTS, code)
	symbolKeyed := runFormatScanWithDTS(t, runtypesWithSymbolFormatsDTS, code)

	if symbolKeyed.FormatAnnotation == nil {
		t.Fatalf("symbol-keyed sentinels were NOT recognised: the brand degraded to a bare %v. "+
			"isSentinelProp expects tsgo to name such a property %q + declName + \"@\" + symbolId; "+
			"if upstream changed that scheme, update it there", symbolKeyed.Kind, typeid.LateBoundNamePrefixForTest())
	}
	if symbolKeyed.FormatAnnotation.Name != "fixture" {
		t.Fatalf("symbol-keyed format name = %q, want %q", symbolKeyed.FormatAnnotation.Name, "fixture")
	}
	if got, ok := symbolKeyed.FormatAnnotation.Params["tag"]; !ok || got != float64(1) {
		t.Fatalf("symbol-keyed params.tag = %v (ok=%v), want 1", got, ok)
	}
	if stringKeyed.FormatAnnotation == nil {
		t.Fatalf("string-keyed sentinels were not recognised — the baseline itself is broken")
	}
	// The point of the whole encoding: how the key is SPELLED must not change
	// the type's identity, so a fixture written either way caches as one entry.
	if symbolKeyed.ID != stringKeyed.ID {
		t.Fatalf("id depends on the sentinel key spelling: symbol-keyed %q vs string-keyed %q", symbolKeyed.ID, stringKeyed.ID)
	}
}
