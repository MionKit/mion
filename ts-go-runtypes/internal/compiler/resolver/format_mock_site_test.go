package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// scanMockSite scans a file whose only marker call is createMockDataFn: no validator is compiled for the type,
// so the format checks must still reach the mock site, or the build passes and the mock throws at run time.
func scanMockSite(t *testing.T, decls, call string) protocol.Response {
	t.Helper()
	code := `import {createMockDataFn} from '@mionjs/run-types/mocking';
import * as TF from '@mionjs/run-types/formats';
` + decls + `
` + call + `
`
	resp := setupInline(t, map[string]string{"a.ts": code}).Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// Every sample is longer than maxLength, so the mock filters them all out and throws.
const tooLongSamples = `type Code = TF.String<{maxLength: 2; mockSamples: ['abcd', 'xyz']}>;`

// Two constraints a string format never takes together.
const conflictingParams = `type Code = TF.String<{length: 3; maxLength: 5}>;`

func expectMockSiteDiag(t *testing.T, resp protocol.Response, code string) {
	t.Helper()
	found := findDiag(resp, code)
	if found == nil || found.Site.StartLine <= 0 {
		t.Fatalf("expected %s at the mock call, got %+v", code, resp.Diagnostics)
	}
}

func TestMockSite_SampleOutOfBoundsStatic(t *testing.T) {
	resp := scanMockSite(t, tooLongSamples, `export const mock = createMockDataFn<Code>();`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
}

func TestMockSite_SampleOutOfBoundsValue(t *testing.T) {
	resp := scanMockSite(t, tooLongSamples+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
}

func TestMockSite_InvalidParamsStatic(t *testing.T) {
	resp := scanMockSite(t, conflictingParams, `export const mock = createMockDataFn<Code>();`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTInvalidParams)
}

func TestMockSite_InvalidParamsValue(t *testing.T) {
	resp := scanMockSite(t, conflictingParams+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`)
	expectMockSiteDiag(t, resp, diagnostics.CodeFMTInvalidParams)
}

// TestMockSite_NestedUnionMember: a union arm, a Map value and a Set entry are mocked too, so they are checked too.
func TestMockSite_NestedUnionMember(t *testing.T) {
	positions := map[string]string{
		"union member": `type Order = {item: {code: Code | number}};`,
		"map value":    `type Order = {byId: Map<string, Code>};`,
		"set entry":    `type Order = {codes: Set<Code>};`,
	}
	for name, decl := range positions {
		t.Run(name, func(t *testing.T) {
			resp := scanMockSite(t, tooLongSamples+"\n"+decl, `export const mock = createMockDataFn<Order>();`)
			expectMockSiteDiag(t, resp, diagnostics.CodeFMTSampleBounds)
		})
	}
}

// TestMockSite_CleanFormatReportsNothing: a format whose samples fit stays clean at a mock site.
func TestMockSite_CleanFormatReportsNothing(t *testing.T) {
	resp := scanMockSite(t, `type Code = TF.String<{maxLength: 4; mockSamples: ['abcd', 'xyz']}>;`, `export const mock = createMockDataFn<Code>();`)
	for _, code := range []string{diagnostics.CodeFMTSampleBounds, diagnostics.CodeFMTInvalidParams} {
		if found := findDiag(resp, code); found != nil {
			t.Fatalf("a fitting format must stay clean, got %+v", found)
		}
	}
}
