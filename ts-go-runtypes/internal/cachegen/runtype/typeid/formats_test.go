package typeid_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// The test overlay extends the standard runtypes.d.ts with a TypeFormat
// alias that lowers to a base-and-brand intersection. tsgo widens it the
// same way the production ts-runtypes/formats type will — two
// sentinel properties carrying the format name and the literal params —
// so the scanner exercises the real detection path, not a parallel one.
const runtypesWithFormatsDTS = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function getRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type TypeFormat<Base, Name extends string, Params, BrandName extends string = never> = Base & {
    readonly __rtFormatName?: Name;
    readonly __rtFormatParams?: Params;
  } & ([BrandName] extends [never] ? unknown : {readonly __rtFormatBrand: BrandName});
}
`

// runFormatScan builds an in-memory program with the format-aware .d.ts
// overlay, scans the supplied code, and returns the root call site's
// RunType. Sibling of rootFor in structural_test.go — kept separate so
// the format-specific .d.ts doesn't leak into the shared overlay.
func runFormatScan(t *testing.T, code string) *protocol.RunType {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	dtsPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	testPath := tspath.ResolvePath(cwd, "test.ts")
	overlay := map[string]string{
		dtsPath:  runtypesWithFormatsDTS,
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
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type FixtureFormat = TypeFormat<string, 'fixture', {tag: 1}>;
getRunTypeId<FixtureFormat>();
`)
	if root.Kind != protocol.KindString {
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
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type FmtA = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<FmtA>();
`)
	rootB := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type FmtB = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<FmtB>();
`)
	if rootA.ID != rootB.ID {
		t.Fatalf("expected identical FormatAnnotation params to produce identical ids; got %q vs %q", rootA.ID, rootB.ID)
	}
}

func TestFormatAnnotation_DistinctParamsDistinctID(t *testing.T) {
	root10 := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type Fmt10 = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Fmt10>();
`)
	root20 := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type Fmt20 = TypeFormat<string, 'fixture', {maxLength: 20}>;
getRunTypeId<Fmt20>();
`)
	if root10.ID == root20.ID {
		t.Fatalf("expected distinct params to produce distinct ids; both got %q", root10.ID)
	}
}

func TestFormatAnnotation_KeyOrderIndependent(t *testing.T) {
	rootAB := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type FmtAB = TypeFormat<string, 'fixture', {a: 1, b: 2}>;
getRunTypeId<FmtAB>();
`)
	rootBA := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type FmtBA = TypeFormat<string, 'fixture', {b: 2, a: 1}>;
getRunTypeId<FmtBA>();
`)
	if rootAB.ID != rootBA.ID {
		t.Fatalf("expected key-order independence; got %q vs %q", rootAB.ID, rootBA.ID)
	}
}

func TestFormatAnnotation_BareKindDistinctFromBrand(t *testing.T) {
	rootBare := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`)
	rootBranded := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
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
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type Plain = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Plain>();
`)
	branded := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
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
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type Other = TypeFormat<string, 'fixture', {maxLength: 10}, 'OtherBrand'>;
getRunTypeId<Other>();
`)
	if otherBrand.ID != unbranded.ID {
		t.Fatalf("a different BrandName must also be id-neutral; %q != %q", otherBrand.ID, unbranded.ID)
	}
}

func TestFormatAnnotation_StructuralKey_Canonicalises(t *testing.T) {
	a := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "fixture",
		Params: map[string]any{"a": 1.0, "b": 2.0},
	})
	b := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
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

// TestFormatAnnotation_SamplesFoldIntoKey pins that mockSamples and message
// ARE id-relevant: cache entries are shared singletons and for createMockDataFn
// the samples are behaviour — two same-shape formats differing only in
// samples/message must NOT collapse onto one entry (first-intern
// nondeterminism).
func TestFormatAnnotation_SamplesFoldIntoKey(t *testing.T) {
	withSamples := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0, "mockSamples": []any{"a", "b"}, "message": "too long"},
	})
	bare := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0},
	})
	if withSamples == bare {
		t.Fatalf("mockSamples/message must affect the key; both gave %q", bare)
	}
	// Id-relevant at nested depth too (FormatPattern nests them in `pattern`).
	nested := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"pattern": map[string]any{"source": "^x$", "flags": "", "mockSamples": []any{"x"}}},
	})
	nestedNoSamples := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"pattern": map[string]any{"source": "^x$", "flags": ""}},
	})
	if nested == nestedNoSamples {
		t.Fatalf("nested mockSamples must affect the key; both gave %q", nested)
	}
	// Identical params (samples included) still converge on one key.
	if again := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "stringFormat",
		Params: map[string]any{"maxLength": 10.0, "mockSamples": []any{"a", "b"}, "message": "too long"},
	}); again != withSamples {
		t.Fatalf("identical params must share a key: %q vs %q", again, withSamples)
	}
	// Sanity: a real validation param (maxLength) still differentiates.
	if bare == nestedNoSamples {
		t.Fatalf("different validation params must still differ")
	}
}

// TestFormatAnnotation_SamplesDistinctEndToEnd confirms sample id-relevance
// holds through the full scan → structural id (not just the key fn): formats
// differing only in mockSamples intern as DIFFERENT entries, each mocking
// from its own samples.
func TestFormatAnnotation_SamplesDistinctEndToEnd(t *testing.T) {
	a := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type T = TypeFormat<string, 'stringFormat', {maxLength: 10; mockSamples: ['a', 'b']}>;
getRunTypeId<T>();
`)
	b := runFormatScan(t, `
import {getRunTypeId} from '@ts-runtypes/core';
import type {TypeFormat} from '@ts-runtypes/core';
type T = TypeFormat<string, 'stringFormat', {maxLength: 10; mockSamples: ['x', 'y', 'z']}>;
getRunTypeId<T>();
`)
	if a.ID == b.ID {
		t.Fatalf("formats differing only in mockSamples must NOT share one id; both gave %q", a.ID)
	}
}
