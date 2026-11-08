package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A mock-only site compiles no validator for its type, so the format checks must still reach the mock site, or the
// build passes and the mock throws at run time. These use scanGenerator (format_generator_test.go).

// Every sample is longer than maxLength, so the mock filters them all out and throws.
const tooLongSamples = `type Code = TF.String<{maxLength: 2; mockSamples: ['abcd', 'xyz']}>;`

// Two constraints a string format never takes together.
const conflictingParams = `type Code = TF.String<{length: 3; maxLength: 5}>;`

func expectMockSiteDiag(t *testing.T, resp protocol.Response, code string) *diagnostics.Diagnostic {
	t.Helper()
	found := findDiag(resp, code)
	if found == nil || found.Site.StartLine <= 0 {
		t.Fatalf("expected %s at the call, got %+v", code, resp.Diagnostics)
	}
	return found
}

func TestMockSite_SampleOutOfBoundsStatic(t *testing.T) {
	resp := scanGenerator(t, tooLongSamples, `export const mock = createMockDataFn<Code>();`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
}

func TestMockSite_SampleOutOfBoundsValue(t *testing.T) {
	resp := scanGenerator(t, tooLongSamples+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
}

func TestMockSite_InvalidParamsStatic(t *testing.T) {
	resp := scanGenerator(t, conflictingParams, `export const mock = createMockDataFn<Code>();`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTInvalidParams)
}

func TestMockSite_InvalidParamsValue(t *testing.T) {
	resp := scanGenerator(t, conflictingParams+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTInvalidParams)
}

// A union arm, a Map value and a Set entry are mocked too, so they are checked too.
var nestedMockPositions = map[string]string{
	"union member": `type Order = {item: {code: Code | number}};`,
	"map value":    `type Order = {byId: Map<string, Code>};`,
	"set entry":    `type Order = {codes: Set<Code>};`,
}

func TestMockSite_NestedPositionsStatic(t *testing.T) {
	for name, decl := range nestedMockPositions {
		t.Run(name, func(t *testing.T) {
			resp := scanGenerator(t, tooLongSamples+"\n"+decl, `export const mock = createMockDataFn<Order>();`)
			expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
		})
	}
}

func TestMockSite_NestedPositionsValue(t *testing.T) {
	for name, decl := range nestedMockPositions {
		t.Run(name, func(t *testing.T) {
			resp := scanGenerator(t, tooLongSamples+"\n"+decl+"\ndeclare const order: Order;", `export const mock = createMockDataFn(order);`)
			expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
		})
	}
}

const fittingSamples = `type Code = TF.String<{maxLength: 4; mockSamples: ['abcd', 'xyz']}>;`

func expectNoFormatDiag(t *testing.T, resp protocol.Response) {
	t.Helper()
	for _, code := range []string{diagnostics.CodeFMTSampleBounds, diagnostics.CodeFMTInvalidParams, diagnostics.CodeFMTGeneratorInvalid, diagnostics.CodeFMTSampleGenFailed} {
		if found := findDiag(resp, code); found != nil {
			t.Fatalf("expected a clean build, got %+v", found)
		}
	}
}

func TestMockSite_CleanFormatReportsNothingStatic(t *testing.T) {
	expectNoFormatDiag(t, scanGenerator(t, fittingSamples, `export const mock = createMockDataFn<Code>();`))
}

func TestMockSite_CleanFormatReportsNothingValue(t *testing.T) {
	expectNoFormatDiag(t, scanGenerator(t, fittingSamples+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`))
}

// TestMockSite_DumpAndGenerateReportToo: the dump (batch compile) and generate ops report the same finding as a scan.
func TestMockSite_DumpAndGenerateReportToo(t *testing.T) {
	code := generatorPreamble + tooLongSamples + "\nexport const mock = createMockDataFn<Code>();\n"
	t.Run("dump", func(t *testing.T) {
		resp := setupInline(t, map[string]string{"a.ts": code}).Dispatch(protocol.Request{Op: protocol.OpDump})
		if resp.Error != "" {
			t.Fatalf("dump: %s", resp.Error)
		}
		expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
	})
	t.Run("generate", func(t *testing.T) {
		genDir := t.TempDir()
		session := setupInlineWith(t, map[string]string{"a.ts": code}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.GenDir = genDir
		})
		resp := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
		if resp.Error != "" {
			t.Fatalf("generate: %s", resp.Error)
		}
		expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
	})
}
