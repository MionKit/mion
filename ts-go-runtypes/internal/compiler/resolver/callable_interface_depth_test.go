package resolver_test

import (
	"slices"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A callable interface with a field is a function to DataOnly: a noted drop in a property, a throw in an array.

const callableWithPropShared = `export interface Handler { (): void; label: string }
`

const callableWithPropImports = `import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
import type {Handler} from './shared.ts';
`

func callableSiteCodes(t *testing.T, allInternal bool, site string) []string {
	t.Helper()
	sources := map[string]string{"shared.ts": callableWithPropShared, "site.ts": callableWithPropImports + site + "\n"}
	var session *resolver.Session
	if allInternal {
		session = setupInlineModeAllInternal(t, sources)
	} else {
		session = setupInline(t, sources)
	}
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"site.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var codes []string
	for _, diagnostic := range response.Diagnostics {
		if shortFile(diagnostic.Site.FilePath) == "site.ts" {
			codes = append(codes, diagnostic.Code)
		}
	}
	return codes
}

func expectCallableCode(t *testing.T, site, code string) {
	t.Helper()
	for _, allInternal := range []bool{false, true} {
		if codes := callableSiteCodes(t, allInternal, site); !slices.Contains(codes, code) {
			t.Errorf("allInternal=%v: want %s at the site, got %v", allInternal, code, codes)
		}
	}
}

func TestCallableInterfaceProperty_DropsWithNote_Static(t *testing.T) {
	expectCallableCode(t, `export const check = createValidateFn<{handler: Handler; id: string}>();`, diagnostics.CodeVLFunctionPropDropped)
}

func TestCallableInterfaceProperty_DropsWithNote_Value(t *testing.T) {
	expectCallableCode(t, `declare const value: {handler: Handler; id: string};
export const check = createValidateFn(value);`, diagnostics.CodeVLFunctionPropDropped)
}

func TestCallableInterfaceArrayElement_ThrowReported_Static(t *testing.T) {
	expectCallableCode(t, `export const check = createValidateFn<{handlers: Handler[]}>();`, diagnostics.CodeVLFunctionRoot)
}

func TestCallableInterfaceArrayElement_ThrowReported_Value(t *testing.T) {
	expectCallableCode(t, `declare const value: {handlers: Handler[]};
export const check = createValidateFn(value);`, diagnostics.CodeVLFunctionRoot)
}

func TestCallableInterfaceArrayElement_MutateEncoderThrowReported_Static(t *testing.T) {
	expectCallableCode(t, `export const encode = createJsonEncoderFn<{handlers: Handler[]}>(undefined, {strategy: 'mutate'});`, diagnostics.CodePJFunctionRoot)
}

func TestCallableInterfaceArrayElement_MutateEncoderThrowReported_Value(t *testing.T) {
	expectCallableCode(t, `declare const value: {handlers: Handler[]};
export const encode = createJsonEncoderFn(value, {strategy: 'mutate'});`, diagnostics.CodePJFunctionRoot)
}

// The clone encoder's all-JSON-safe shortcut once shipped `Array.from(map)`, turning each function into null.
func TestCallableInterfaceMapValue_CloneEncoderThrowReported_Static(t *testing.T) {
	expectCallableCode(t, `export const encode = createJsonEncoderFn<Map<string, Handler>>();`, diagnostics.CodePJSFunctionRoot)
}

func TestCallableInterfaceMapValue_CloneEncoderThrowReported_Value(t *testing.T) {
	expectCallableCode(t, `declare const value: Map<string, Handler>;
export const encode = createJsonEncoderFn(value);`, diagnostics.CodePJSFunctionRoot)
}
