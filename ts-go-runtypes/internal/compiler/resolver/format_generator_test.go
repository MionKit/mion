package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// scanGenerator scans decls + call with the validate, mock and formats imports in scope.
func scanGenerator(t *testing.T, decls, call string) protocol.Response {
	t.Helper()
	code := `import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
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

func expectGeneratorInvalid(t *testing.T, resp protocol.Response, reason string) {
	t.Helper()
	found := findDiag(resp, diagnostics.CodeFMTGeneratorInvalid)
	if found == nil || found.Site.StartLine <= 0 {
		t.Fatalf("expected format-generator-invalid at the call, got %+v", resp.Diagnostics)
	}
	if !strings.Contains(strings.Join(found.Args, " "), reason) {
		t.Fatalf("expected the reason to mention %q, got %v", reason, found.Args)
	}
}

func expectNoGeneratorInvalid(t *testing.T, resp protocol.Response) {
	t.Helper()
	for _, code := range []string{diagnostics.CodeFMTGeneratorInvalid, diagnostics.CodeFMTInvalidParams, diagnostics.CodeFMTSampleBounds, diagnostics.CodeFMTSampleGenFailed} {
		if found := findDiag(resp, code); found != nil {
			t.Fatalf("expected a clean build, got %+v", found)
		}
	}
}

// A last name is never one character long.
const tooShortForGenerator = `type Code = TF.String<{maxLength: 1; generator: 'lastName'}>;`

func TestFormatGenerator_TooShortStatic(t *testing.T) {
	expectGeneratorInvalid(t, scanGenerator(t, tooShortForGenerator, `export const isCode = createValidateFn<Code>();`), "2 to 10")
}

func TestFormatGenerator_TooShortValue(t *testing.T) {
	resp := scanGenerator(t, tooShortForGenerator+`
declare const code: Code;`, `export const isCode = createValidateFn(code);`)
	expectGeneratorInvalid(t, resp, "2 to 10")
}

func TestFormatGenerator_NestedMember(t *testing.T) {
	resp := scanGenerator(t, tooShortForGenerator+`
type Order = {item: {code: Code}};`, `export const isOrder = createValidateFn<Order>();`)
	expectGeneratorInvalid(t, resp, "2 to 10")
}

// An email's localPart is a nested string format and takes a generator too.
func TestFormatGenerator_EmailLocalPart(t *testing.T) {
	resp := scanGenerator(t, `import type {TypeFormat} from '@mionjs/run-types';
type Work = TypeFormat<string, 'email', {localPart: {generator: 'fullName'; allowedChars: {val: 'abcdefghijklmnopqrstuvwxyz'}}}>;`,
		`export const isWork = createValidateFn<Work>();`)
	expectGeneratorInvalid(t, resp, "allowedChars")
}

// TestFormatGenerator_MockOnlySite: a type only mocked still gets the check, at the mock call.
func TestFormatGenerator_MockOnlySiteStatic(t *testing.T) {
	expectGeneratorInvalid(t, scanGenerator(t, tooShortForGenerator, `export const mock = createMockDataFn<Code>();`), "2 to 10")
}

func TestFormatGenerator_MockOnlySiteValue(t *testing.T) {
	resp := scanGenerator(t, tooShortForGenerator+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`)
	expectGeneratorInvalid(t, resp, "2 to 10")
}

func TestFormatGenerator_BesideMockSamples(t *testing.T) {
	resp := scanGenerator(t, `type Code = TF.String<{generator: 'city'; mockSamples: ['Rome']}>;`, `export const isCode = createValidateFn<Code>();`)
	expectGeneratorInvalid(t, resp, "mockSamples")
}

// TestFormatGenerator_CleanCases: a generator that fits stays clean, including the cases a generator makes legal.
func TestFormatGenerator_CleanCases(t *testing.T) {
	cases := map[string]string{
		"fits":                            `type Code = TF.String<{maxLength: 40; generator: 'lastName'}>;`,
		"alpha preset":                    `type Code = TF.Alpha<{maxLength: 3; generator: 'firstName'}>;`,
		"disallowedChars without samples": `type Code = TF.String<{disallowedChars: {val: '@'; mockSamples: ''}; generator: 'city'}>;`,
		"sample-less pattern":             `type Code = TF.String<{pattern: {source: '^[A-Z][a-z]+$'}; generator: 'firstName'}>;`,
		"custom name":                     `type Code = TF.String<{maxLength: 1; generator: 'testCode'}>;`,
	}
	for name, decl := range cases {
		t.Run(name, func(t *testing.T) {
			expectNoGeneratorInvalid(t, scanGenerator(t, decl, `export const isCode = createValidateFn<Code>();
export const mock = createMockDataFn<Code>();`))
		})
	}
}
