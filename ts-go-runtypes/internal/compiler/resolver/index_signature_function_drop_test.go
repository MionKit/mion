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

// A symbol key never reaches JSON or a for-in loop, so its index signature drops with the symbol-key note.
func TestIndexSignatureSymbolKey_Validate_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const check = createValidateFn<{p0: number; [k: string | symbol]: number}>();`, diagnostics.CodeVLSymbolKeyedDropped)
}

func TestIndexSignatureSymbolKey_Validate_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {p0: number; [k: string | symbol]: number};
export const check = createValidateFn(value);`, diagnostics.CodeVLSymbolKeyedDropped)
}

func TestIndexSignatureSymbolKey_CloneEncoder_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const encode = createJsonEncoderFn<{p0: number; [k: string | symbol]: number}>();`, diagnostics.CodePJSSymbolKeyedDropped)
}

func TestIndexSignatureSymbolKey_CloneEncoder_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {p0: number; [k: string | symbol]: number};
export const encode = createJsonEncoderFn(value);`, diagnostics.CodePJSSymbolKeyedDropped)
}

func TestIndexSignatureSymbolKey_CloneDecoder_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const decode = createJsonDecoderFn<{[k: symbol]: number; a: string}>();`, diagnostics.CodeRJSymbolKeyedDropped)
}

func TestIndexSignatureSymbolKey_CloneDecoder_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {[k: symbol]: number; a: string};
export const decode = createJsonDecoderFn(value);`, diagnostics.CodeRJSymbolKeyedDropped)
}

// The in-place codecs dedup index signatures by value type; the symbol one must still get its note.
func TestIndexSignatureSymbolKey_MutateEncoder_Static(t *testing.T) {
	expectIndexSignatureNote(t, `export const encode = createJsonEncoderFn<{p0: number; [k: string | symbol]: number}>(undefined, {strategy: 'mutate'});`, diagnostics.CodePJSymbolKeyedDropped)
}

func TestIndexSignatureSymbolKey_MutateEncoder_Value(t *testing.T) {
	expectIndexSignatureNote(t, `declare const value: {p0: number; [k: string | symbol]: number};
export const encode = createJsonEncoderFn(value, {strategy: 'mutate'});`, diagnostics.CodePJSymbolKeyedDropped)
}
