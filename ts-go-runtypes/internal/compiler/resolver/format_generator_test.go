package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// generatorPreamble brings the validate, mock and formats imports into scope.
const generatorPreamble = `import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import * as TF from '@mionjs/run-types/formats';
`

// scanGenerator scans decls + call under generatorPreamble.
func scanGenerator(t *testing.T, decls, call string) protocol.Response {
	t.Helper()
	resp := setupInline(t, map[string]string{"a.ts": generatorPreamble + decls + "\n" + call + "\n"}).Dispatch(protocol.Request{
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
	found := expectMockSiteDiag(t, resp, diagnostics.CodeFMTGeneratorInvalid)
	if !strings.Contains(strings.Join(found.Args, " "), reason) {
		t.Fatalf("expected the reason to mention %q, got %v", reason, found.Args)
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

func TestFormatGenerator_NestedMemberStatic(t *testing.T) {
	resp := scanGenerator(t, tooShortForGenerator+`
type Order = {item: {code: Code}};`, `export const isOrder = createValidateFn<Order>();`)
	expectGeneratorInvalid(t, resp, "2 to 10")
}

func TestFormatGenerator_NestedMemberValue(t *testing.T) {
	resp := scanGenerator(t, tooShortForGenerator+`
type Order = {item: {code: Code}};
declare const order: Order;`, `export const isOrder = createValidateFn(order);`)
	expectGeneratorInvalid(t, resp, "2 to 10")
}

// An email's localPart takes a generator too; spelled with the exact TypeFormat, since TF.EmailParts cannot set it.
const emailLocalPart = `import type {TypeFormat} from '@mionjs/run-types';
type Work = TypeFormat<string, 'email', {localPart: {generator: 'fullName'; allowedChars: {val: 'abcdefghijklmnopqrstuvwxyz'}}}>;`

func TestFormatGenerator_EmailLocalPartStatic(t *testing.T) {
	expectGeneratorInvalid(t, scanGenerator(t, emailLocalPart, `export const isWork = createValidateFn<Work>();`), "allowedChars")
}

func TestFormatGenerator_EmailLocalPartValue(t *testing.T) {
	resp := scanGenerator(t, emailLocalPart+`
declare const work: Work;`, `export const isWork = createValidateFn(work);`)
	expectGeneratorInvalid(t, resp, "allowedChars")
}

// A type only mocked still gets the check, at the mock call.
func TestFormatGenerator_MockOnlySiteStatic(t *testing.T) {
	expectGeneratorInvalid(t, scanGenerator(t, tooShortForGenerator, `export const mock = createMockDataFn<Code>();`), "2 to 10")
}

func TestFormatGenerator_MockOnlySiteValue(t *testing.T) {
	resp := scanGenerator(t, tooShortForGenerator+`
declare const code: Code;`, `export const mock = createMockDataFn(code);`)
	expectGeneratorInvalid(t, resp, "2 to 10")
}

const besideMockSamples = `type Code = TF.String<{generator: 'city'; mockSamples: ['Rome']}>;`

func TestFormatGenerator_BesideMockSamplesStatic(t *testing.T) {
	expectGeneratorInvalid(t, scanGenerator(t, besideMockSamples, `export const isCode = createValidateFn<Code>();`), "mockSamples")
}

func TestFormatGenerator_BesideMockSamplesValue(t *testing.T) {
	resp := scanGenerator(t, besideMockSamples+`
declare const code: Code;`, `export const isCode = createValidateFn(code);`)
	expectGeneratorInvalid(t, resp, "mockSamples")
}

// A widened `generator: string` or a union of names is no single generator: the typeid arm marks it unreadable.
var widenedGenerators = map[string]string{
	"string": `type Code = TF.String<{generator: string}>;`,
	"union":  `type Code = TF.String<{generator: 'firstName' | 'lastName'}>;`,
}

func TestFormatGenerator_WidenedNameStatic(t *testing.T) {
	for name, decl := range widenedGenerators {
		t.Run(name, func(t *testing.T) {
			expectGeneratorInvalid(t, scanGenerator(t, decl, `export const isCode = createValidateFn<Code>();`), "string literal")
		})
	}
}

func TestFormatGenerator_WidenedNameValue(t *testing.T) {
	for name, decl := range widenedGenerators {
		t.Run(name, func(t *testing.T) {
			resp := scanGenerator(t, decl+"\ndeclare const code: Code;", `export const isCode = createValidateFn(code);`)
			expectGeneratorInvalid(t, resp, "string literal")
		})
	}
}

// Fitting generators stay clean; a custom name skips the table checks (TypeScript catches typos via MockGeneratorName).
var cleanGeneratorCases = map[string]string{
	"fits":                            `type Code = TF.String<{maxLength: 40; generator: 'lastName'}>;`,
	"alpha preset":                    `type Code = TF.Alpha<{maxLength: 3; generator: 'firstName'}>;`,
	"disallowedChars without samples": `type Code = TF.String<{disallowedChars: {val: '@'; mockSamples: ''}; generator: 'city'}>;`,
	"sample-less pattern":             `type Code = TF.String<{pattern: {source: '^[A-Z][a-z]+$'}; generator: 'firstName'}>;`,
	"custom name":                     `type Code = TF.String<{maxLength: 1; generator: 'testCode'}>;`,
}

func TestFormatGenerator_CleanCasesStatic(t *testing.T) {
	for name, decl := range cleanGeneratorCases {
		t.Run(name, func(t *testing.T) {
			expectNoFormatDiag(t, scanGenerator(t, decl, `export const isCode = createValidateFn<Code>();
export const mock = createMockDataFn<Code>();`))
		})
	}
}

func TestFormatGenerator_CleanCasesValue(t *testing.T) {
	for name, decl := range cleanGeneratorCases {
		t.Run(name, func(t *testing.T) {
			expectNoFormatDiag(t, scanGenerator(t, decl+"\ndeclare const code: Code;", `export const isCode = createValidateFn(code);
export const mock = createMockDataFn(code);`))
		})
	}
}

// TestFormatGenerator_PatternSamplesNotGenerated: a generator replaces the pattern's samples, so none are generated.
func TestFormatGenerator_PatternSamplesNotGenerated(t *testing.T) {
	code := generatorPreamble + `type Code = TF.String<{pattern: {source: '^[A-Z][a-z]+$'}; generator: 'firstName'}>;
type Plain = TF.String<{pattern: {source: '^[a-z]+$'}}>;
export const mock = createMockDataFn<Code>();
export const mockPlain = createMockDataFn<Plain>();
`
	resp := setupInline(t, map[string]string{"a.ts": code}).Dispatch(protocol.Request{Op: protocol.OpDump})
	if resp.Error != "" {
		t.Fatalf("dump: %s", resp.Error)
	}
	var withGenerator, plain map[string]any
	for _, node := range resp.RunTypes {
		if node.FormatAnnotation == nil {
			continue
		}
		pattern, _ := node.FormatAnnotation.Params["pattern"].(map[string]any)
		if _, has := node.FormatAnnotation.Params["generator"]; has {
			withGenerator = pattern
		} else if pattern != nil {
			plain = pattern
		}
	}
	if withGenerator == nil || plain == nil {
		t.Fatal("both patterns must be in the dump")
	}
	if _, generated := withGenerator["mockSamples"]; generated {
		t.Fatalf("a pattern beside a generator must get no generated samples, got %v", withGenerator["mockSamples"])
	}
	if _, generated := plain["mockSamples"]; !generated {
		t.Fatal("control: a pattern without a generator gets generated samples")
	}
}
