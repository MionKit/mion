package resolver_test

import (
	"regexp"
	"strings"
	"testing"

	// Register the concrete format emitters (stringFormat, …) — the
	// in-process resolver test doesn't go through main.go, which is
	// where the binary normally blank-imports this aggregator.
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// A locally-declared TypeFormat alias produces the same brand
// intersection the published `ts-runtypes/formats` one does —
// the scanner recognises it structurally (the two sentinel properties),
// not by import source. Lets these tests stay self-contained.
const typeFormatBrandDecl = `type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
`

// TestFormatSamples_MismatchEmitsFMT001 — a mockSample that doesn't
// match the format's own pattern must surface as an FMT001 error at
// build time (the sample would otherwise feed createMockDataFn an
// invalid value).
func TestFormatSamples_MismatchEmitsFMT001(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[0-9]+$'; flags: ''};
  mockSamples: ['42', 'not-a-number', '7'];
}>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var found *diagnostics.Diagnostic
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diagnostics.CodeFMTSampleMismatch {
			found = &resp.Diagnostics[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTSampleMismatch, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	// First arg is the offending sample.
	if len(found.Args) == 0 || found.Args[0] != "not-a-number" {
		t.Errorf("expected offending sample 'not-a-number' in args, got %+v", found.Args)
	}
}

// TestFormatSamples_AllValidNoDiagnostic — when every sample matches
// the pattern, no FMT001 fires.
func TestFormatSamples_AllValidNoDiagnostic(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[0-9]+$'; flags: ''};
  mockSamples: ['42', '7', '007'];
}>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diagnostics.CodeFMTSampleMismatch {
			t.Fatalf("expected no FMT001 for all-valid samples, got %+v", resp.Diagnostics[i])
		}
	}
}

// findDiag returns the first diagnostic with the given code, or nil.
func findDiag(resp protocol.Response, code string) *diagnostics.Diagnostic {
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == code {
			return &resp.Diagnostics[i]
		}
	}
	return nil
}

// scanBuild runs a build-lane scan (entry modules, no lint diagnostics).
func scanBuild(t testing.TB, session *resolver.Session) protocol.Response {
	t.Helper()
	resp := session.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// TestFormatSamples_BoundsEmitFMT003 — a mockSample that satisfies the
// pattern but violates a sibling length bound surfaces FMT003, naming
// every offending sample in the one message (the diagnostic pipeline
// dedups per code per walk).
func TestFormatSamples_BoundsEmitFMT003(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  minLength: 5;
  pattern: {source: '^b+$'; flags: ''; mockSamples: ['b', 'bb']};
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": code}))
	found := findDiag(resp, diagnostics.CodeFMTSampleBounds)
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTSampleBounds, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	message := strings.Join(found.Args, " ")
	if !strings.Contains(message, `"b"`) || !strings.Contains(message, `"bb"`) {
		t.Errorf("expected both offending samples named in %q", message)
	}
	if !strings.Contains(message, "minLength") {
		t.Errorf("expected the violated constraint named in %q", message)
	}
}

// TestFormatSamples_PartialLengthSurvivorNoFMT003 — a length bound is a
// FILTER at mock time (filterSamplesByLength), so a sample list where SOME
// survive is valid: the mock draws from the survivors. FMT003 must NOT fire
// here (only the all-violate case throws). Guards the false positive found on
// the `Alpha<{maxLength:3}>` / `['aa','aaaaaa']` fixtures.
func TestFormatSamples_PartialLengthSurvivorNoFMT003(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  minLength: 5;
  pattern: {source: '^a+$'; flags: ''; mockSamples: ['aa', 'aaaaaa']};
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": code}))
	if found := findDiag(resp, diagnostics.CodeFMTSampleBounds); found != nil {
		t.Fatalf("expected no FMT003 when a length-compatible sample survives, got %+v", found)
	}
}

// TestFormatSamples_AstralLengthCodePoints — sample lengths are counted in CODE
// POINTS, matching the emitted validator (JSON Schema's rule): an astral
// character (U+1D7D8 '𝟘') is ONE, so it fits maxLength 1, and only a second one
// trips it. Counting bytes (4 each) or UTF-16 units (2 each) would report a
// violation the runtime never agrees with.
func TestFormatSamples_AstralLengthCodePoints(t *testing.T) {
	// maxLength 1: one astral character is one code point → fits.
	fits := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  maxLength: 1;
  mockSamples: ['𝟘'];
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": fits}))
	if found := findDiag(resp, diagnostics.CodeFMTSampleBounds); found != nil {
		t.Fatalf("maxLength 1: expected no bounds diagnostic (one code point fits), got %+v", found)
	}

	// maxLength 1 with TWO astral characters → two code points → violation.
	tooLong := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  maxLength: 1;
  mockSamples: ['𝟘𝟘'];
}>>();
`
	resp = scanBuild(t, setupInline(t, map[string]string{"a.ts": tooLong}))
	if findDiag(resp, diagnostics.CodeFMTSampleBounds) == nil {
		t.Fatalf("maxLength 1: expected %s for a two-code-point astral sample, got %+v",
			diagnostics.CodeFMTSampleBounds, resp.Diagnostics)
	}
}

// lookbehindSource builds a fixture around a JS-only lookbehind pattern
// (RE2 could never compile it) carrying the given mockSample. Shared by
// the JS-engine lanes below.
func lookbehindSource(sample string) string {
	return `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '(?<=a)b'; flags: ''; mockSamples: ['` + sample + `']};
}>>();
`
}

// TestFormatSamples_LookbehindValidates — the headline of the JS-engine
// move: a pattern using JS-only regex syntax is REALLY validated now. A
// matching sample passes with no FMT diagnostic at all (previously the
// build failed closed with FMT004); a mismatching one is a plain FMT001.
func TestFormatSamples_LookbehindValidates(t *testing.T) {
	good := scanBuild(t, setupInline(t, map[string]string{"a.ts": lookbehindSource("ab")}))
	for _, code := range []string{diagnostics.CodeFMTSampleMismatch, diagnostics.CodeFMTInvalidParams, diagnostics.CodeFMTMissingJsRuntime} {
		if found := findDiag(good, code); found != nil {
			t.Fatalf("lookbehind with matching sample: expected no %s, got %+v", code, found)
		}
	}
	bad := scanBuild(t, setupInline(t, map[string]string{"a.ts": lookbehindSource("zz")}))
	found := findDiag(bad, diagnostics.CodeFMTSampleMismatch)
	if found == nil {
		t.Fatalf("lookbehind with mismatching sample: expected %s, got %+v", diagnostics.CodeFMTSampleMismatch, bad.Diagnostics)
	}
	if len(found.Args) == 0 || found.Args[0] != "zz" {
		t.Errorf("expected offending sample 'zz' in args, got %+v", found.Args)
	}
}

// TestFormatSamples_InvalidSyntaxFMT002 — a pattern that does not compile
// under the real JS engine (a regex typo) fails the build with FMT002:
// the emitted validator's `new RegExp` would throw at factory load.
// Previously this sailed through as "unchecked" and crashed at runtime.
func TestFormatSamples_InvalidSyntaxFMT002(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[a-z+$'; flags: ''; mockSamples: ['a']};
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": code}))
	found := findDiag(resp, diagnostics.CodeFMTInvalidParams)
	if found == nil {
		t.Fatalf("expected an %s diagnostic for invalid regex syntax, got %+v", diagnostics.CodeFMTInvalidParams, resp.Diagnostics)
	}
	if len(found.Args) == 0 || !strings.Contains(found.Args[0], "does not compile as a JS RegExp") {
		t.Errorf("expected the compile-failure message in args, got %+v", found.Args)
	}
}

// TestFormatSamples_NoRuntimeFMT004 — when the engine cannot run and the
// project HAS patterns, every pattern-bearing site fails closed with the
// missing-runtime FMT004 (never a silent skip; the allowUncheckedPatterns
// escape hatch is gone with the RE2 oracle).
func TestFormatSamples_NoRuntimeFMT004(t *testing.T) {
	session := setupInlineWith(t, map[string]string{"a.ts": lookbehindSource("ab")},
		func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.JSEngine = jsengine.NewSidecar("/nonexistent/definitely-not-a-js-runtime")
		})
	resp := scanBuild(t, session)
	found := findDiag(resp, diagnostics.CodeFMTMissingJsRuntime)
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTMissingJsRuntime, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	if len(found.Args) == 0 || found.Args[0] != "(?<=a)b" {
		t.Errorf("expected the pattern source in args, got %+v", found.Args)
	}
	if found := findDiag(resp, diagnostics.CodeFMTSampleMismatch); found != nil {
		t.Fatalf("no engine ran, so no sample verdict is possible — got FMT001 %+v", found)
	}
}

// TestFormatSamples_NoRuntimeZeroPatternsClean — the JS runtime is a
// LAZY requirement: a project with no patterns builds cleanly even when
// no engine could ever run.
func TestFormatSamples_NoRuntimeZeroPatternsClean(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
export const _ = createValidateFn<{name: string; age: number}>();
`
	session := setupInlineWith(t, map[string]string{"a.ts": code},
		func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.JSEngine = nil
		})
	resp := scanBuild(t, session)
	if found := findDiag(resp, diagnostics.CodeFMTMissingJsRuntime); found != nil {
		t.Fatalf("zero-pattern project must not need a JS runtime, got %+v", found)
	}
}

// samplelessPatternSource builds the paired-shape fixture for the
// generation lanes: the SAME sample-less pattern demanded through BOTH
// marker call shapes (static createValidateFn<T>() and reflection
// createValidateFn(value) — the marker coverage rule), so one interned
// format node serves both sites.
const samplelessPatternSource = `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
type Code = TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[a-z]{3}$'; flags: ''};
}>;
export const staticForm = createValidateFn<Code>();
declare const value: Code;
export const reflectForm = createValidateFn(value);
`

// generationScan runs the build-lane scan with the wire RunTypes included
// so the enriched annotation is observable.
func generationScan(t testing.TB, session *resolver.Session) protocol.Response {
	t.Helper()
	resp := session.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
		IncludeRunTypes:     true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// patternSamplesFrom digs the pattern.mockSamples list out of the one
// stringFormat node in a response's wire RunTypes ("" when absent).
func patternSamplesFrom(t testing.TB, resp protocol.Response) (nodeID string, samples []string) {
	t.Helper()
	for _, node := range resp.RunTypes {
		if node == nil || node.FormatAnnotation == nil || node.FormatAnnotation.Name != "stringFormat" {
			continue
		}
		if nodeID != "" {
			t.Fatalf("expected ONE interned stringFormat node for both call shapes, found a second (%s and %s)", nodeID, node.ID)
		}
		nodeID = node.ID
		pattern, _ := node.FormatAnnotation.Params["pattern"].(map[string]any)
		if pattern == nil {
			continue
		}
		raw, _ := pattern["mockSamples"].([]any)
		for _, item := range raw {
			if s, ok := item.(string); ok {
				samples = append(samples, s)
			}
		}
	}
	if nodeID == "" {
		t.Fatalf("no stringFormat node in the response RunTypes")
	}
	return nodeID, samples
}

// withSampleKnobs returns a setupInlineWith hook pinning the generation
// knobs (single-threaded so the fixture is deterministic to debug).
func withSampleKnobs(count, retries int) func(*program.Options, *resolver.Options) {
	return func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.PatternSampleCount = count
		resolverOpts.PatternSampleRetries = retries
	}
}

// TestFormatSamples_GeneratedSamplesFillAnnotation — the headline of the
// auto-generation feature: a pattern with NO declared mockSamples builds
// clean, the wire annotation carries generated samples that all match the
// pattern, and both marker call shapes share the one enriched node. With
// no mock.seed anywhere, pools are RANDOM per build: an independent
// session (fresh engine child = a fresh build) draws a DIFFERENT list.
func TestFormatSamples_GeneratedSamplesFillAnnotation(t *testing.T) {
	sources := map[string]string{"a.ts": samplelessPatternSource}
	resp := generationScan(t, setupInlineWith(t, sources, withSampleKnobs(5, 10)))
	for _, code := range []string{diagnostics.CodeFMTSampleGenFailed, diagnostics.CodeFMTSampleMismatch, diagnostics.CodeFMTInvalidParams, diagnostics.CodeFMTMissingJsRuntime} {
		if found := findDiag(resp, code); found != nil {
			t.Fatalf("sample-less pattern must build clean under generation, got %s: %+v", code, found)
		}
	}
	_, samples := patternSamplesFrom(t, resp)
	if len(samples) != 5 {
		t.Fatalf("expected PatternSampleCount=5 generated samples, got %d: %v", len(samples), samples)
	}
	// ^[a-z]{3}$ is in the RE2==JS shared-semantics subset, so Go's regexp
	// is a faithful oracle for this fixture.
	oracle := regexp.MustCompile(`^[a-z]{3}$`)
	for _, sample := range samples {
		if !oracle.MatchString(sample) {
			t.Fatalf("generated sample %q does not match ^[a-z]{3}$ (all: %v)", sample, samples)
		}
	}

	// No seed anywhere ⇒ a fresh session (fresh build) re-rolls the pool.
	// (2^-32 chance of two equal random session keys — accepted, matching
	// the engine-level test.)
	respAgain := generationScan(t, setupInlineWith(t, sources, withSampleKnobs(5, 10)))
	_, samplesAgain := patternSamplesFrom(t, respAgain)
	if strings.Join(samplesAgain, "\x00") == strings.Join(samples, "\x00") {
		t.Fatalf("unseeded pools must differ across builds, both: %v", samples)
	}
	// Within ONE session the pool is stable: re-dispatching returns the
	// same enriched annotation (idempotent pass + engine memo).
	respSame := generationScan(t, setupInlineWith(t, sources, withSampleKnobs(5, 10)))
	_, first := patternSamplesFrom(t, respSame)
	_, second := patternSamplesFrom(t, respSame)
	if strings.Join(first, "\x00") != strings.Join(second, "\x00") {
		t.Fatalf("one session must stay stable:\n first: %v\nsecond: %v", first, second)
	}
}

// seededMockSource is the reproducibility fixture: the SAME sample-less
// pattern demanded through BOTH createMockDataFn call shapes, each
// carrying the literal `{mock: {seed: 42}}` the CompTimeHints slot lets
// the build read.
const seededMockSource = `import {createMockDataFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
type Code = TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[a-z]{3}$'; flags: ''};
}>;
export const mockStatic = createMockDataFn<Code>(undefined, {mock: {seed: 42}});
declare const value: Code;
export const mockReflect = createMockDataFn(value, {mock: {seed: 42}});
`

// TestFormatSamples_SeededMockSitePoolsReproducible — a literal mock.seed
// at the createMockDataFn call site pins the pool: two independent
// sessions (two builds) generate the IDENTICAL list, and the seed leaves
// the typeID untouched (same id as the unseeded fixture's node — the seed
// shapes only the annotation content).
func TestFormatSamples_SeededMockSitePoolsReproducible(t *testing.T) {
	sources := map[string]string{"a.ts": seededMockSource}
	respA := generationScan(t, setupInlineWith(t, sources, withSampleKnobs(5, 10)))
	idSeeded, samplesA := patternSamplesFrom(t, respA)
	if len(samplesA) != 5 {
		t.Fatalf("expected 5 generated samples, got %v", samplesA)
	}
	respB := generationScan(t, setupInlineWith(t, sources, withSampleKnobs(5, 10)))
	_, samplesB := patternSamplesFrom(t, respB)
	if strings.Join(samplesA, "\x00") != strings.Join(samplesB, "\x00") {
		t.Fatalf("seeded pools must be identical across builds:\n first: %v\nsecond: %v", samplesA, samplesB)
	}
	// A DIFFERENT seed draws a different pool (still reproducible per seed).
	otherSeed := strings.Replace(seededMockSource, "seed: 42", "seed: 43", 2)
	respC := generationScan(t, setupInlineWith(t, map[string]string{"a.ts": otherSeed}, withSampleKnobs(5, 10)))
	_, samplesC := patternSamplesFrom(t, respC)
	if strings.Join(samplesA, "\x00") == strings.Join(samplesC, "\x00") {
		t.Fatalf("different seeds must draw different pools, both: %v", samplesA)
	}
	// typeID stability: the seed never folds into the structural id.
	idUnseeded, _ := patternSamplesFrom(t, generationScan(t, setupInlineWith(t, map[string]string{"a.ts": samplelessPatternSource}, withSampleKnobs(5, 10))))
	if idSeeded != idUnseeded {
		t.Fatalf("mock.seed must not affect typeIDs: seeded=%s unseeded=%s", idSeeded, idUnseeded)
	}
}

// TestFormatSamples_DeclaredSamplesUntouched — declared samples always
// win: generation never appends to or replaces a declared list.
func TestFormatSamples_DeclaredSamplesUntouched(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[a-z]{3}$'; flags: ''; mockSamples: ['abc', 'xyz']};
}>>();
`
	resp := generationScan(t, setupInlineWith(t, map[string]string{"a.ts": code}, withSampleKnobs(5, 10)))
	_, samples := patternSamplesFrom(t, resp)
	if strings.Join(samples, ",") != "abc,xyz" {
		t.Fatalf("declared samples must pass through untouched, got %v", samples)
	}
}

// TestFormatSamples_GenerationDisabledFMT005 — patternSampleCount 0
// disables generation, so a sample-less pattern is a build error telling
// the user to declare samples (never a silent mock-time throw).
func TestFormatSamples_GenerationDisabledFMT005(t *testing.T) {
	resp := generationScan(t, setupInlineWith(t, map[string]string{"a.ts": samplelessPatternSource}, withSampleKnobs(0, 10)))
	found := findDiag(resp, diagnostics.CodeFMTSampleGenFailed)
	if found == nil {
		t.Fatalf("expected %s with generation disabled, got %+v", diagnostics.CodeFMTSampleGenFailed, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	if len(found.Args) < 2 || found.Args[0] != "^[a-z]{3}$" || !strings.Contains(found.Args[1], "disabled") {
		t.Errorf("expected [pattern source, disabled reason] args, got %+v", found.Args)
	}
}

// TestFormatSamples_UngeneratableFMT005 — a pattern the generator cannot
// handle (lookbehind compiles under new RegExp but makes randexp throw)
// fails with FMT005 carrying the reason, anchored like every format
// diagnostic. Declaring mockSamples is the documented fix.
func TestFormatSamples_UngeneratableFMT005(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '(?<=a)b'; flags: ''};
}>>();
`
	resp := generationScan(t, setupInlineWith(t, map[string]string{"a.ts": code}, withSampleKnobs(5, 10)))
	found := findDiag(resp, diagnostics.CodeFMTSampleGenFailed)
	if found == nil {
		t.Fatalf("expected %s for an ungeneratable construct, got %+v", diagnostics.CodeFMTSampleGenFailed, resp.Diagnostics)
	}
	if len(found.Args) < 2 || found.Args[0] != "(?<=a)b" || found.Args[1] == "" {
		t.Errorf("expected [pattern source, failure reason] args, got %+v", found.Args)
	}
	// The pattern itself is valid JS regex — the compile lanes stay quiet.
	if found := findDiag(resp, diagnostics.CodeFMTInvalidParams); found != nil {
		t.Errorf("lookbehind compiles under new RegExp; unexpected FMT002 %+v", found)
	}
}

// TestFormatSamples_TypeIDStableAcrossKnobs — generation is post-intern:
// the SAME sample-less pattern interns to the SAME typeID whatever the
// knobs say (5, 50, or disabled). And since mockSamples is NOT id-relevant,
// a DECLARED-samples variant of the same pattern interns to that same id too
// (samples describe the same validator — they no longer fold in).
func TestFormatSamples_TypeIDStableAcrossKnobs(t *testing.T) {
	sources := map[string]string{"a.ts": samplelessPatternSource}
	id5, _ := patternSamplesFrom(t, generationScan(t, setupInlineWith(t, sources, withSampleKnobs(5, 10))))
	id50, _ := patternSamplesFrom(t, generationScan(t, setupInlineWith(t, sources, withSampleKnobs(50, 10))))
	idOff, _ := patternSamplesFrom(t, generationScan(t, setupInlineWith(t, sources, withSampleKnobs(0, 10))))
	if id5 != id50 || id5 != idOff {
		t.Fatalf("typeID must not depend on the generation knobs: count5=%s count50=%s off=%s", id5, id50, idOff)
	}
	declared := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
type Code = TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[a-z]{3}$'; flags: ''; mockSamples: ['abc']};
}>;
export const _ = createValidateFn<Code>();
`
	idDeclared, _ := patternSamplesFrom(t, generationScan(t, setupInlineWith(t, map[string]string{"a.ts": declared}, withSampleKnobs(5, 10))))
	if idDeclared != id5 {
		t.Fatalf("declared samples are NOT id-relevant and must share the sample-less id; declared=%s sampleless=%s", idDeclared, id5)
	}
	// A different VALIDATION param (a pattern source change) still forks the id.
	otherPattern := strings.Replace(declared, "^[a-z]{3}$", "^[a-z]{4}$", 1)
	idOther, _ := patternSamplesFrom(t, generationScan(t, setupInlineWith(t, map[string]string{"a.ts": otherPattern}, withSampleKnobs(5, 10))))
	if idOther == id5 {
		t.Fatalf("a different pattern source must fork the typeID; both %s", id5)
	}
}

// TestFormatSamples_LintLaneGetsFMT001 — the lint lane
// (IncludeRtDiagnostics) receives pattern verdicts as ORDINARY
// diagnostics now; the dedicated uncheckedPatterns wire channel and the
// lint worker's own RegExp re-check are gone.
func TestFormatSamples_LintLaneGetsFMT001(t *testing.T) {
	session := setupInline(t, map[string]string{"a.ts": lookbehindSource("zz")})
	resp := session.Dispatch(protocol.Request{
		Op:                   protocol.OpScanFiles,
		Files:                []string{"a.ts"},
		IncludeRtDiagnostics: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	found := findDiag(resp, diagnostics.CodeFMTSampleMismatch)
	if found == nil {
		t.Fatalf("expected FMT001 on the lint lane as a normal diagnostic, got %+v", resp.Diagnostics)
	}
	if found.Site.FilePath == "" || found.Site.StartLine == 0 {
		t.Errorf("expected a definition site on the diagnostic, got %+v", found.Site)
	}
}
