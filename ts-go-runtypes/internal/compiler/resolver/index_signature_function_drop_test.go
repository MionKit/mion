package resolver_test

import (
	"slices"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A function-valued index signature drops like a function-valued property: with the family's …010 note, never silently.

const indexSignatureFunctionImports = `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
`

func expectIndexSignatureNote(t *testing.T, site, code string) {
	t.Helper()
	response := setupInline(t, map[string]string{"site.ts": indexSignatureFunctionImports + site + "\n"}).Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"site.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	if codes := codesOf(response); !slices.Contains(codes, code) {
		t.Errorf("want %s for the dropped index signature, got %v", code, codes)
	}
}

func TestIndexSignatureFunction_Validate_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const check = createValidateFn<{handlers: {[key: string]: () => void}}>();`, diagnostics.CodeVLFunctionPropDropped)
}

func TestIndexSignatureFunction_Validate_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {handlers: {[key: string]: () => void}};
export const check = createValidateFn(value);`, diagnostics.CodeVLFunctionPropDropped)
}

func TestIndexSignatureFunction_CloneEncoder_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const encode = createJsonEncoderFn<{handlers: {[key: string]: () => void}}>();`, diagnostics.CodePJSFunctionPropDropped)
}

func TestIndexSignatureFunction_CloneEncoder_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {handlers: {[key: string]: () => void}};
export const encode = createJsonEncoderFn(value);`, diagnostics.CodePJSFunctionPropDropped)
}

func TestIndexSignatureFunction_CloneDecoder_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const decode = createJsonDecoderFn<{handlers: {[key: string]: () => void}}>();`, diagnostics.CodeRJFunctionPropDropped)
}

func TestIndexSignatureFunction_CloneDecoder_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {handlers: {[key: string]: () => void}};
export const decode = createJsonDecoderFn(value);`, diagnostics.CodeRJFunctionPropDropped)
}
